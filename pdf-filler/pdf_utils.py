"""
pdf_utils.py — PDF 模板分析 + overlay 生成 + 合并工具
核心策略：原 PDF 作为不可变背景，用 reportlab 生成透明 overlay，再用 pymupdf 合并
"""
import fitz  # pymupdf
fitz.TOOLS.mupdf_display_errors(False)  # 抑制 MuPDF warning 输出到 stderr
import json
import os
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import black, white, red
from PIL import Image

# ── 常量 ──────────────────────────────────────────────────────────────
A4_W_PT = 595.28
A4_H_PT = 841.89


# ═══════════════════════════════════════════════════════════════════════
# 第 1 部分：PDF 模板分析
# ═══════════════════════════════════════════════════════════════════════

def analyze_template(pdf_path):
    """分析 PDF 模板：页数、尺寸、是否有 AcroForm 表单域"""
    doc = fitz.open(pdf_path)
    info = {
        'path': pdf_path,
        'page_count': len(doc),
        'has_acroform': False,
        'form_fields': [],
        'pages': [],
    }

    # 检测 AcroForm
    catalog = doc.pdf_catalog()
    try:
        xref = doc.xref_get_key(catalog, "AcroForm")
        if xref and xref[0] != 'null':
            info['has_acroform'] = True
    except Exception:
        pass

    # 枚举表单域（如果有）
    for page in doc:
        widgets = page.widgets()
        if widgets:
            for w in widgets:
                info['form_fields'].append({
                    'field_name': w.field_name,
                    'field_type': w.field_type_string,
                    'rect': list(w.rect),
                    'page': page.number,
                })

    # 页面尺寸
    for page in doc:
        rect = page.rect
        info['pages'].append({
            'page_no': page.number,
            'width': rect.width,
            'height': rect.height,
        })

    doc.close()
    return info


def generate_grid_pdf(pdf_path, output_path, grid_spacing=20):
    """在 PDF 每页上叠加坐标网格，用于手动校准字段坐标"""
    doc = fitz.open(pdf_path)
    for page in doc:
        w, h = page.rect.width, page.rect.height
        # 竖线
        for x in range(0, int(w), grid_spacing):
            page.draw_line((x, 0), (x, h), color=(0.8, 0.8, 1), width=0.3)
            if x % 100 == 0:
                page.draw_line((x, 0), (x, h), color=(0.5, 0.5, 1), width=0.5)
                page.insert_text((x + 1, 10), str(x), fontsize=6, color=(1, 0, 0))
        # 横线
        for y in range(0, int(h), grid_spacing):
            page.draw_line((0, y), (w, y), color=(0.8, 0.8, 1), width=0.3)
            if y % 100 == 0:
                page.draw_line((0, y), (w, y), color=(0.5, 0.5, 1), width=0.5)
                page.insert_text((1, y + 8), str(y), fontsize=6, color=(1, 0, 0))
    doc.save(output_path)
    doc.close()
    print(f"Grid PDF saved: {output_path}")


# ═══════════════════════════════════════════════════════════════════════
# 第 2 部分：Overlay 生成（ReportLab）
# ═══════════════════════════════════════════════════════════════════════

class OverlayBuilder:
    """
    用 ReportLab 在内存中生成一个透明 PDF overlay。
    坐标系统：与 pymupdf 一致，原点在左上角 (x=从左, y=从上)。
    内部转换为 ReportLab 的左下角原点。
    """

    # CJK 字体候选列表（优先项目内置字体，再回退系统字体）
    _SYSTEM_CJK_FONTS = [
        os.path.join(os.path.dirname(__file__), 'fonts', 'simhei.ttf'),  # 项目内置黑体（最可靠）
        r'C:\Windows\Fonts\simhei.ttf',     # 黑体 (Windows)
        r'C:\Windows\Fonts\simsunb.ttf',     # 宋体粗
        r'C:\Windows\Fonts\simfang.ttf',     # 仿宋
        r'C:\Windows\Fonts\simkai.ttf',      # 楷体
        r'C:\Windows\Fonts\msyh.ttc',        # 微软雅黑
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',       # Debian/Ubuntu
        '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc',
        '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',            # Another variant
        '/System/Library/Fonts/PingFang.ttc',  # macOS
    ]

    def __init__(self, page_width=A4_W_PT, page_height=A4_H_PT, font_path=None):
        self.w = page_width
        self.h = page_height
        self.buffer = BytesIO()
        self.c = canvas.Canvas(self.buffer, pagesize=(page_width, page_height))
        self.pages_data = []  # 当前页数据
        self._font_registered = False
        self._cjk_font_name = 'Helvetica'

        # 注册中文字体：优先用传入的，否则自动查找系统字体
        font_candidates = [font_path] if font_path else []
        font_candidates.extend(self._SYSTEM_CJK_FONTS)

        for fp in font_candidates:
            if fp and os.path.exists(fp):
                try:
                    if fp.endswith('.ttc'):
                        # TTC 集合字体需要指定 subfontIndex
                        pdfmetrics.registerFont(TTFont('CJK', fp, subfontIndex=0))
                    else:
                        pdfmetrics.registerFont(TTFont('CJK', fp))
                    self._cjk_font_name = 'CJK'
                    self._font_registered = True
                    break
                except Exception:
                    continue  # 尝试下一个字体

        if not self._font_registered:
            print("Warning: No CJK font found, Chinese text will display as boxes")

    def _rl_y(self, y):
        """将 top-left y 转为 ReportLab bottom-left y"""
        return self.h - y

    def _has_cjk(self, text):
        """检测文本是否含 CJK 字符"""
        for ch in str(text):
            if ord(ch) > 0x2E80:
                return True
        return False

    def _get_font(self, text, font_name=None):
        """根据文本内容选择字体"""
        if font_name:
            return font_name
        if self._font_registered and self._has_cjk(text):
            return self._cjk_font_name
        return 'Helvetica'

    def text(self, x, y, text, font_size=9, font_name=None, bold=False, max_width=None):
        """
        在指定坐标(左上角系)写入单行文字
        x, y: 文字顶部的左上角坐标 (pymupdf 坐标系)
        """
        if text is None or str(text).strip() == '':
            return
        text = str(text)
        fn = self._get_font(text, font_name)
        if bold and fn == 'Helvetica':
            fn = 'Helvetica-Bold'
        self.c.setFont(fn, font_size)
        self.c.setFillColor(black)

        if max_width:
            # 先尝试缩小字号（最小 5.5pt）
            while self.c.stringWidth(text, fn, font_size) > max_width and font_size > 5.5:
                font_size -= 0.5
                self.c.setFont(fn, font_size)
            # 如果缩到最小还超宽，自动换行而不是截断
            if self.c.stringWidth(text, fn, font_size) > max_width:
                self.multiline_text(x, y, text, font_size=font_size, line_height=font_size + 2, max_width=max_width, max_lines=3, font_name=fn)
                return

        # ReportLab drawString y = baseline = 页面底部往上
        self.c.drawString(x, self._rl_y(y) - font_size * 0.8, text)

    def text_centered(self, x, y, text, font_size=9, width=None, font_name=None):
        """居中写入文字"""
        if text is None or str(text).strip() == '':
            return
        text = str(text)
        fn = self._get_font(text, font_name)
        self.c.setFont(fn, font_size)
        self.c.setFillColor(black)
        if width:
            tw = self.c.stringWidth(text, fn, font_size)
            x = x + (width - tw) / 2
        self.c.drawString(x, self._rl_y(y) - font_size * 0.8, text)

    def multiline_text(self, x, y, text, font_size=8, line_height=12, max_width=480, max_lines=5, font_name=None):
        """多行文字，自动换行（支持中英文混合）"""
        if not text:
            return
        text = str(text)
        fn = self._get_font(text, font_name)
        self.c.setFont(fn, font_size)
        self.c.setFillColor(black)

        # 按字符逐个测量，支持中文（无空格）换行
        lines = []
        current_line = ''
        for ch in text:
            test = current_line + ch
            if self.c.stringWidth(test, fn, font_size) > max_width:
                if current_line:
                    lines.append(current_line)
                current_line = ch
            else:
                current_line = test
        if current_line:
            lines.append(current_line)

        for i, line in enumerate(lines[:max_lines]):
            self.c.drawString(x, self._rl_y(y + i * line_height) - font_size * 0.8, line)

    def checkbox(self, x, y, checked, size=8, style='cross'):
        """
        在指定位置画勾选标记
        x, y: checkbox 左上角坐标 (pymupdf 坐标系, 左上角原点)
        X 从 (x,y) 画到 (x+size, y+size)
        """
        if not checked:
            return
        self.c.setStrokeColor(black)
        self.c.setFillColor(black)

        # 转换: pymupdf (x,y)=左上角 → ReportLab (x, rl_bottom)=左下角
        # checkbox 顶部 = H - y, 底部 = H - y - size
        rl_top = self._rl_y(y)
        rl_bottom = rl_top - size

        if style == 'cross':
            self.c.setLineWidth(1.2)
            self.c.line(x, rl_top, x + size, rl_bottom)
            self.c.line(x + size, rl_top, x, rl_bottom)
        elif style == 'check':
            # 画 ✓ 勾号: 从左下到中下再到右上
            self.c.setLineWidth(1.5)
            mid_x = x + size * 0.3
            self.c.line(x, rl_bottom + size * 0.5, mid_x, rl_bottom)          # 左半笔划↘
            self.c.line(mid_x, rl_bottom, x + size, rl_top)                    # 右半笔划↗
        elif style == 'fill':
            self.c.rect(x, rl_bottom, size, size, fill=1)

    def image(self, x, y, img_path_or_bytes, width, height):
        """插入图片（照片或签名）"""
        try:
            if isinstance(img_path_or_bytes, bytes):
                img_buffer = BytesIO(img_path_or_bytes)
            elif isinstance(img_path_or_bytes, str) and os.path.exists(img_path_or_bytes):
                img_buffer = img_path_or_bytes
            else:
                return
            # (x,y) = 图片左上角 (pymupdf 坐标)
            # ReportLab drawImage 需要左下角: rl_y = H - y - height
            self.c.drawImage(img_buffer, x, self._rl_y(y) - height, width, height,
                             preserveAspectRatio=True, mask='auto')
        except Exception as e:
            print(f"Warning: image insert failed: {e}")

    def line(self, x1, y1, x2, y2, width=0.5):
        """画线（签名线等）"""
        self.c.setStrokeColor(black)
        self.c.setLineWidth(width)
        self.c.line(x1, self._rl_y(y1), x2, self._rl_y(y2))

    def next_page(self, page_width=None, page_height=None):
        """翻到下一页"""
        self.c.showPage()
        if page_width:
            self.w = page_width
        if page_height:
            self.h = page_height

    def save(self):
        """保存 overlay PDF 到内存"""
        self.c.save()
        self.buffer.seek(0)
        return self.buffer


# ═══════════════════════════════════════════════════════════════════════
# 第 3 部分：PDF 合并（PyMuPDF）
# ═══════════════════════════════════════════════════════════════════════

def merge_overlay(template_path, overlay_buffer, output_path):
    """
    将 overlay PDF 叠加到模板 PDF 上
    template_path: 原始模板 PDF 路径
    overlay_buffer: ReportLab 生成的 overlay BytesIO
    output_path: 输出文件路径
    """
    template_doc = fitz.open(template_path)
    overlay_doc = fitz.open("pdf", overlay_buffer.read())

    for i in range(min(len(template_doc), len(overlay_doc))):
        template_page = template_doc[i]
        overlay_page = overlay_doc[i]

        # 将 overlay 页面作为 XObject 插入到模板页面上
        template_page.show_pdf_page(template_page.rect, overlay_doc, i,
                                     overlay=(True,))

    template_doc.save(output_path)
    template_doc.close()
    overlay_doc.close()
    return output_path


# ═══════════════════════════════════════════════════════════════════════
# 第 4 部分：日期 / 格式化工具
# ═══════════════════════════════════════════════════════════════════════

def fmt_date(d):
    """YYYY-MM-DD → DD/MM/YYYY"""
    if not d:
        return ''
    parts = str(d).split('-')
    if len(parts) == 3:
        return f"{parts[2]}/{parts[1]}/{parts[0]}"
    return str(d)

def fmt_amount(v):
    """数字 → S$ 格式"""
    if v is None or v == '' or v == 0:
        return ''
    try:
        n = float(v)
        if n == 0:
            return ''
        return f"{n:,.0f}"
    except (ValueError, TypeError):
        return str(v)

def to_bool(v):
    """正确解析 boolean：string '0'/'false'/'' → False, '1'/'true'/1/True → True"""
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    s = str(v).strip().lower()
    return s in ('1', 'true', 'yes')

def yn(v):
    """布尔 → Yes/No"""
    return 'Yes' if to_bool(v) else 'No'

def safe_str(v):
    """None → ''"""
    return '' if v is None else str(v)


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        info = analyze_template(sys.argv[1])
        print(json.dumps(info, indent=2, ensure_ascii=False))
    else:
        print("Usage: python pdf_utils.py <template.pdf>")
        print("  Analyzes PDF template for form fields and page dimensions")

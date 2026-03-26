#!/usr/bin/env python3
"""
main.py — PDF 模板填充系统主入口
从 stdin 接收 JSON 数据，生成 3 份 PDF

调用方式 (from Node.js):
  echo '{"profile":{...},"family":[...],...}' | python pdf-filler/main.py --template-dir=templates --output-dir=uploads --upload-dir=uploads

参数:
  --profile-id=xxx       profile ID (用于命名输出文件)
  --template-dir=path    模板 PDF 所在目录
  --output-dir=path      输出 PDF 目录
  --upload-dir=path      上传文件目录 (照片/签名)
  --font-path=path       中文字体路径 (可选)
  --forms=SAF,FORM16,V36 要生成的表单 (默认全部)
  --grid                 生成坐标网格调试 PDF
  --analyze              仅分析模板信息，不生成
"""
import sys
import os
import json
import argparse

# 确保能导入同目录模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pdf_utils import analyze_template, generate_grid_pdf
from fill_saf import fill_saf
from fill_form16 import fill_form16
from fill_v36 import fill_v36


TEMPLATE_FILES = {
    'SAF': '2026 Student Application Form.pdf',
    'FORM16': 'form-16_application-for-stp_fss_kid_pei.pdf',
    'V36': 'Form 36_ICA.pdf',
}


def main():
    parser = argparse.ArgumentParser(description='PDF Template Filler')
    parser.add_argument('--profile-id', default='test')
    parser.add_argument('--template-dir', default='templates')
    parser.add_argument('--output-dir', default='uploads')
    parser.add_argument('--upload-dir', default='uploads')
    parser.add_argument('--font-path', default=None)
    parser.add_argument('--forms', default='SAF,FORM16,V36')
    parser.add_argument('--grid', action='store_true', help='Generate grid overlay for coordinate calibration')
    parser.add_argument('--analyze', action='store_true', help='Analyze templates only')
    parser.add_argument('--json-file', default=None, help='Read JSON from file instead of stdin')
    args = parser.parse_args()

    template_dir = os.path.abspath(args.template_dir)
    output_dir = os.path.abspath(args.output_dir)
    upload_dir = os.path.abspath(args.upload_dir)
    os.makedirs(output_dir, exist_ok=True)

    # ── 分析模式 ──
    if args.analyze:
        results = {}
        for form_type, filename in TEMPLATE_FILES.items():
            tpl_path = os.path.join(template_dir, filename)
            if os.path.exists(tpl_path):
                results[form_type] = analyze_template(tpl_path)
            else:
                results[form_type] = {'error': f'Template not found: {tpl_path}'}
        print(json.dumps(results, indent=2, ensure_ascii=False))
        return

    # ── 网格调试模式 ──
    if args.grid:
        for form_type, filename in TEMPLATE_FILES.items():
            tpl_path = os.path.join(template_dir, filename)
            if os.path.exists(tpl_path):
                grid_path = os.path.join(output_dir, f'_grid_{form_type}.pdf')
                generate_grid_pdf(tpl_path, grid_path)
                print(f'Grid: {grid_path}')
            else:
                print(f'SKIP: {tpl_path} not found')
        return

    # ── 读取 JSON 数据 ──
    if args.json_file:
        with open(args.json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    else:
        raw = sys.stdin.read()
        if not raw.strip():
            print(json.dumps({'error': 'No JSON data provided on stdin'}))
            sys.exit(1)
        data = json.loads(raw)

    # ── 生成 PDF ──
    forms = [f.strip() for f in args.forms.split(',')]
    results = []

    generators = {
        'SAF': fill_saf,
        'FORM16': fill_form16,
        'V36': fill_v36,
    }

    for form_type in forms:
        tpl_filename = TEMPLATE_FILES.get(form_type)
        if not tpl_filename:
            results.append({'type': form_type, 'status': 'error', 'error': f'Unknown form type: {form_type}'})
            continue

        tpl_path = os.path.join(template_dir, tpl_filename)
        if not os.path.exists(tpl_path):
            results.append({'type': form_type, 'status': 'error', 'error': f'Template not found: {tpl_path}'})
            continue

        gen_func = generators.get(form_type)
        if not gen_func:
            results.append({'type': form_type, 'status': 'error', 'error': f'No generator for: {form_type}'})
            continue

        import uuid
        out_filename = f'{uuid.uuid4()}.pdf'
        out_path = os.path.join(output_dir, out_filename)

        try:
            gen_func(data, tpl_path, out_path, upload_dir=upload_dir, font_path=args.font_path)
            file_size = os.path.getsize(out_path)
            results.append({
                'type': form_type,
                'status': 'done',
                'fileName': out_filename,
                'filePath': out_path,
                'fileSize': file_size,
            })
        except Exception as e:
            results.append({
                'type': form_type,
                'status': 'failed',
                'error': str(e),
            })

    print(json.dumps(results, ensure_ascii=False))


if __name__ == '__main__':
    main()

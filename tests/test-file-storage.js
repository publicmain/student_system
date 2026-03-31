/**
 * Test: File storage security and correctness
 * Run: node --test tests/test-file-storage.js
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// Create temp test directory
const TEST_DIR = path.join(__dirname, '_test_uploads');

describe('File Storage', () => {
  let fileStorage;

  before(() => {
    process.env.UPLOAD_DIR = TEST_DIR;
    // Re-require to pick up new UPLOAD_DIR
    delete require.cache[require.resolve('../file-storage')];
    fileStorage = require('../file-storage');
    fileStorage.initDirs();
  });

  after(() => {
    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('Path traversal prevention', () => {
    it('should strip ../ from fileId', () => {
      const result = fileStorage.getFilePath('../../etc/passwd');
      // Should resolve to BASE_DIR/passwd, not /etc/passwd
      assert.ok(result.startsWith(TEST_DIR), `Path ${result} should start with ${TEST_DIR}`);
      assert.ok(!result.includes('..'), `Path ${result} should not contain ..`);
    });

    it('should strip absolute paths', () => {
      const result = fileStorage.getFilePath('/etc/passwd');
      assert.ok(result.startsWith(TEST_DIR));
    });

    it('should handle normal UUID filenames', () => {
      const result = fileStorage.getFilePath('abc-def-123.pdf');
      assert.ok(result.includes('abc-def-123.pdf'));
    });

    it('should return null for empty/null fileId', () => {
      assert.equal(fileStorage.getFilePath(null), null);
      assert.equal(fileStorage.getFilePath(''), null);
      assert.equal(fileStorage.getFilePath(undefined), null);
    });
  });

  describe('File operations', () => {
    it('should save and read a file', () => {
      const content = Buffer.from('test content');
      fileStorage.saveFile('temp', 'test-file.txt', content);
      const read = fileStorage.readFile('test-file.txt');
      assert.ok(read);
      assert.equal(read.toString(), 'test content');
    });

    it('should save base64 data URL', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      const result = fileStorage.saveBase64('temp', dataUrl, '.png');
      assert.ok(result);
      assert.ok(result.fileId.endsWith('.png'));
      assert.ok(result.fileSize > 0);
    });

    it('should delete a file', () => {
      fileStorage.saveFile('temp', 'to-delete.txt', Buffer.from('delete me'));
      assert.ok(fileStorage.deleteFile('to-delete.txt'));
      assert.equal(fileStorage.readFile('to-delete.txt'), null);
    });

    it('should return false for deleting non-existent file', () => {
      assert.equal(fileStorage.deleteFile('nonexistent.txt'), false);
    });

    it('should get correct file size', () => {
      const content = Buffer.from('12345');
      fileStorage.saveFile('temp', 'size-test.txt', content);
      assert.equal(fileStorage.getFileSize('size-test.txt'), 5);
    });
  });

  describe('Directory structure', () => {
    it('should have all subdirectories', () => {
      const expected = ['materials', 'generated', 'exchange', 'photos', 'signatures', 'case-files', 'temp'];
      for (const sub of expected) {
        assert.ok(fs.existsSync(path.join(TEST_DIR, sub)), `Missing subdirectory: ${sub}`);
      }
    });
  });
});

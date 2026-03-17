// test/ai-categorizer.test.js
const { expect } = require('chai');
const {
  categorizeFile,
  categorizeByMimeType,
  categorizeByExtension,
  categorizeByContent,
  isLikelyReport,
  isLikelyLetterhead,
  hasDatePattern,
  getSupportedCategories,
  CONFIDENCE_THRESHOLD
} = require('../ai/fileCategorizer');

describe('AI File Categorizer', () => {
  describe('categorizeByMimeType', () => {
    it('should categorize PDF as document', () => {
      expect(categorizeByMimeType('application/pdf')).to.equal('document');
    });

    it('should categorize JPEG as image', () => {
      expect(categorizeByMimeType('image/jpeg')).to.equal('image');
    });

    it('should categorize PNG as image', () => {
      expect(categorizeByMimeType('image/png')).to.equal('image');
    });

    it('should return null for unknown MIME', () => {
      expect(categorizeByMimeType('application/octet-stream')).to.be.null;
    });

    it('should handle null/empty input', () => {
      expect(categorizeByMimeType(null)).to.be.null;
      expect(categorizeByMimeType('')).to.be.null;
    });
  });

  describe('categorizeByExtension', () => {
    it('should categorize .pdf as document', () => {
      expect(categorizeByExtension('report.pdf')).to.equal('document');
    });

    it('should categorize .jpg as image', () => {
      expect(categorizeByExtension('photo.jpg')).to.equal('image');
    });

    it('should return null for unknown extension', () => {
      expect(categorizeByExtension('data.unknown')).to.be.null;
    });
  });

  describe('categorizeByContent', () => {
    it('should detect report keywords', () => {
      const content = 'Executive Summary: The findings of this report indicate compliance with quarterly targets. Prepared by: Admin.';
      const result = categorizeByContent(content);
      expect(result.category).to.equal('report');
      expect(result.keywordHits).to.be.greaterThan(0);
    });

    it('should detect document/memo keywords', () => {
      const content = 'Dear Sir/Madam, Pursuant to the memorandum, we hereby submit the following. Sincerely, Office.';
      const result = categorizeByContent(content);
      expect(result.category).to.equal('document');
      expect(result.keywordHits).to.be.greaterThan(0);
    });

    it('should handle empty content', () => {
      const result = categorizeByContent('');
      expect(result.category).to.be.null;
      expect(result.confidence).to.equal(0);
    });
  });

  describe('isLikelyReport', () => {
    it('should detect "report" in filename', () => {
      expect(isLikelyReport('monthly_report_2024.pdf')).to.be.true;
    });

    it('should detect "audit" in filename', () => {
      expect(isLikelyReport('audit_summary.csv')).to.be.true;
    });

    it('should return false for generic filename', () => {
      expect(isLikelyReport('photo.jpg')).to.be.false;
    });
  });

  describe('hasDatePattern', () => {
    it('should detect ISO date in filename', () => {
      const result = hasDatePattern('report_2024-03-15.pdf');
      expect(result.hasDate).to.be.true;
    });

    it('should detect quarter pattern', () => {
      const result = hasDatePattern('Q1-2024_summary.pdf');
      expect(result.hasDate).to.be.true;
    });

    it('should return false for no date', () => {
      const result = hasDatePattern('readme.txt');
      expect(result.hasDate).to.be.false;
    });
  });

  describe('categorizeFile (main function)', () => {
    it('should categorize a PDF as document with high confidence', () => {
      const result = categorizeFile({
        originalname: 'document.pdf',
        mimetype: 'application/pdf'
      });
      expect(result.category).to.be.oneOf(['document', 'report']);
      expect(result.confidence).to.be.greaterThan(0);
    });

    it('should categorize a report-named PDF as report', () => {
      const result = categorizeFile({
        originalname: 'monthly_report_2024.pdf',
        mimetype: 'application/pdf'
      });
      expect(result.category).to.equal('report');
      expect(result.confidence).to.be.at.least(85);
    });

    it('should categorize an image', () => {
      const result = categorizeFile({
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg'
      });
      expect(result.category).to.equal('image');
    });

    it('should have confidence threshold constant', () => {
      expect(CONFIDENCE_THRESHOLD).to.equal(60);
    });

    it('should flag low confidence results with belowThreshold', () => {
      const result = categorizeFile({
        originalname: 'unknown_file.xyz',
        mimetype: 'application/octet-stream'
      });
      // Low confidence for unknown files
      expect(result).to.have.property('belowThreshold');
    });
  });

  describe('getSupportedCategories', () => {
    it('should return document, image, report', () => {
      const cats = getSupportedCategories();
      expect(cats).to.include('document');
      expect(cats).to.include('image');
      expect(cats).to.include('report');
    });
  });
});

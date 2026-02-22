import { describe, it, expect } from 'vitest';
import { validateCommitMessage } from '../../hooks/plugin-patterns/index.js';

describe('validateCommitMessage', () => {
  describe('default types (no config)', () => {
    it('accepts a valid conventional commit message', () => {
      const result = validateCommitMessage('feat: add new feature');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts all default types', () => {
      const defaultTypes = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
      for (const type of defaultTypes) {
        const result = validateCommitMessage(`${type}: some description`);
        expect(result.valid).toBe(true);
      }
    });

    it('rejects an unknown type', () => {
      const result = validateCommitMessage('ship: deploy changes');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('conventional commit format'))).toBe(true);
    });

    it('includes default type list in error message', () => {
      const result = validateCommitMessage('ship: deploy changes');
      expect(result.errors.some(e => e.includes('feat'))).toBe(true);
    });
  });

  describe('custom types via config.types', () => {
    it('accepts a custom type when configured', () => {
      const result = validateCommitMessage('ship: deploy changes', { types: ['ship', 'rollback'] });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects a default type not present in the custom list', () => {
      const result = validateCommitMessage('feat: add feature', { types: ['ship', 'rollback'] });
      expect(result.valid).toBe(false);
    });

    it('includes custom types in the error message', () => {
      const result = validateCommitMessage('unknown: change', { types: ['ship', 'rollback'] });
      expect(result.errors.some(e => e.includes('ship'))).toBe(true);
      expect(result.errors.some(e => e.includes('rollback'))).toBe(true);
    });

    it('does not mention default types when custom types are provided', () => {
      const result = validateCommitMessage('unknown: change', { types: ['ship'] });
      // Error should list 'ship', not the whole default set
      const typeError = result.errors.find(e => e.startsWith('Allowed types:'));
      expect(typeError).toBeDefined();
      expect(typeError).toContain('ship');
      expect(typeError).not.toContain('feat');
    });

    it('falls back to default types when config.types is an empty array', () => {
      const result = validateCommitMessage('feat: add feature', { types: [] });
      expect(result.valid).toBe(true);
    });

    it('accepts a custom type with scope', () => {
      const result = validateCommitMessage('ship(api): deploy api changes', { types: ['ship'] });
      expect(result.valid).toBe(true);
    });

    it('accepts a custom type with breaking-change marker', () => {
      const result = validateCommitMessage('ship!: breaking deploy', { types: ['ship'] });
      expect(result.valid).toBe(true);
    });
  });

  describe('other config options still work alongside custom types', () => {
    it('enforces maxSubjectLength with custom types', () => {
      const result = validateCommitMessage('ship: ' + 'a'.repeat(70), {
        types: ['ship'],
        maxSubjectLength: 50,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds'))).toBe(true);
    });

    it('enforces requireScope with custom types', () => {
      const result = validateCommitMessage('ship: change without scope', {
        types: ['ship'],
        requireScope: true,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Scope is required'))).toBe(true);
    });

    it('enforces requireBody with custom types', () => {
      const result = validateCommitMessage('ship: change without body', {
        types: ['ship'],
        requireBody: true,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('body is required'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('rejects an empty commit message', () => {
      const result = validateCommitMessage('', { types: ['ship'] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Commit message cannot be empty');
    });

    it('rejects a whitespace-only commit message', () => {
      const result = validateCommitMessage('   ', { types: ['ship'] });
      expect(result.valid).toBe(false);
    });
  });
});

import { describe, expect, it } from 'bun:test'
import { z } from 'zod'
import { validateFrontmatter } from '../src/plugin/validation'
import type { FrontmatterLineMap } from '../src/plugin/markdown'

const simpleSchema = z.object({
  title: z.string(),
  draft: z.boolean().optional(),
})

const nestedSchema = z.object({
  title: z.string(),
  metadata: z.object({
    name: z.string(),
    date: z.string(),
  }),
})

describe('validateFrontmatter', () => {
  it('returns validated data for valid frontmatter', () => {
    const frontmatter = { title: 'Hello', draft: false }
    const lineMap: FrontmatterLineMap = { title: 2, draft: 3 }

    const result = validateFrontmatter(frontmatter, simpleSchema, '/test/post.md', lineMap)

    expect(result).toEqual({ title: 'Hello', draft: false })
  })

  it('returns validated data with optional fields omitted', () => {
    const frontmatter = { title: 'Hello' }
    const lineMap: FrontmatterLineMap = { title: 2 }

    const result = validateFrontmatter(frontmatter, simpleSchema, '/test/post.md', lineMap)

    expect(result).toEqual({ title: 'Hello' })
  })

  it('returns validated data for nested schema', () => {
    const frontmatter = {
      title: 'Post',
      metadata: { name: 'Jane', date: '2025-01-01' },
    }
    const lineMap: FrontmatterLineMap = {
      title: 2,
      metadata: 3,
      'metadata.name': 4,
      'metadata.date': 5,
    }

    const result = validateFrontmatter(frontmatter, nestedSchema, '/test/post.md', lineMap)

    expect(result).toEqual(frontmatter)
  })

  it('throws on missing required field', () => {
    const frontmatter = {}
    const lineMap: FrontmatterLineMap = {}

    expect(() =>
      validateFrontmatter(frontmatter, simpleSchema, '/test/post.md', lineMap),
    ).toThrow(/Schema validation failed/)
  })

  it('throws on wrong type', () => {
    const frontmatter = { title: 123 }
    const lineMap: FrontmatterLineMap = { title: 2 }

    expect(() =>
      validateFrontmatter(frontmatter, simpleSchema, '/test/post.md', lineMap),
    ).toThrow(/Schema validation failed/)
  })

  it('includes file path in error message', () => {
    const frontmatter = { title: 123 }
    const lineMap: FrontmatterLineMap = { title: 2 }

    try {
      validateFrontmatter(frontmatter, simpleSchema, '/pages/blog/broken.md', lineMap)
    } catch (err) {
      expect((err as Error).message).toContain('/pages/blog/broken.md')
    }
  })

  it('includes line number in error for known key paths', () => {
    const frontmatter = { title: 123 }
    const lineMap: FrontmatterLineMap = { title: 2 }

    try {
      validateFrontmatter(frontmatter, simpleSchema, '/test/post.md', lineMap)
    } catch (err) {
      expect((err as Error).message).toContain(':2')
      expect((err as Error).message).toContain('"title"')
    }
  })

  it('maps nested error paths to line numbers', () => {
    const frontmatter = { title: 'OK', metadata: { name: 42, date: '2025-01-01' } }
    const lineMap: FrontmatterLineMap = {
      title: 2,
      metadata: 3,
      'metadata.name': 4,
      'metadata.date': 5,
    }

    try {
      validateFrontmatter(frontmatter, nestedSchema, '/test/post.md', lineMap)
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toContain(':4')
      expect(msg).toContain('"metadata.name"')
    }
  })

  it('falls back to parent path for unmapped nested keys', () => {
    const schema = z.object({
      config: z.object({
        deep: z.object({
          value: z.string(),
        }),
      }),
    })
    const frontmatter = { config: { deep: { value: 123 } } }
    const lineMap: FrontmatterLineMap = { config: 2 }

    try {
      validateFrontmatter(frontmatter, schema, '/test/post.md', lineMap)
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toContain(':2')
    }
  })

  it('reports multiple validation errors at once', () => {
    const frontmatter = { title: 123, metadata: { name: 456, date: 789 } }
    const lineMap: FrontmatterLineMap = {
      title: 2,
      metadata: 3,
      'metadata.name': 4,
      'metadata.date': 5,
    }

    try {
      validateFrontmatter(frontmatter, nestedSchema, '/test/post.md', lineMap)
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toContain('"title"')
      expect(msg).toContain('"metadata.name"')
      expect(msg).toContain('"metadata.date"')
    }
  })

  it('sets error name to ContentCollectionValidationError', () => {
    const frontmatter = { title: 123 }
    const lineMap: FrontmatterLineMap = { title: 2 }

    try {
      validateFrontmatter(frontmatter, simpleSchema, '/test/post.md', lineMap)
    } catch (err) {
      expect((err as Error).name).toBe('ContentCollectionValidationError')
    }
  })
})

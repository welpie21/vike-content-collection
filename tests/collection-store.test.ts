import { describe, expect, it, beforeEach } from 'bun:test'
import { CollectionStore, type Collection } from '../src/plugin/collection-store'

function makeCollection(configDir: string, entryCount: number = 1): Collection {
  const entries = Array.from({ length: entryCount }, (_, i) => ({
    filePath: `${configDir}/post-${i}.md`,
    frontmatter: { title: `Post ${i}`, index: i },
    content: `Content of post ${i}`,
    lineMap: { title: 2 },
  }))

  return {
    configDir,
    configPath: `${configDir}/+Content.ts`,
    entries,
  }
}

describe('CollectionStore', () => {
  let store: CollectionStore

  beforeEach(() => {
    store = new CollectionStore()
  })

  it('starts empty', () => {
    expect(store.getAll()).toEqual([])
    expect(store.has('/pages/blog')).toBe(false)
  })

  it('stores and retrieves a collection', () => {
    const collection = makeCollection('/pages/blog')
    store.set('/pages/blog', collection)

    expect(store.has('/pages/blog')).toBe(true)
    expect(store.get('/pages/blog')).toBe(collection)
  })

  it('returns undefined for missing collections', () => {
    expect(store.get('/pages/missing')).toBeUndefined()
  })

  it('overwrites an existing collection', () => {
    const first = makeCollection('/pages/blog', 1)
    const second = makeCollection('/pages/blog', 3)

    store.set('/pages/blog', first)
    store.set('/pages/blog', second)

    expect(store.get('/pages/blog')!.entries).toHaveLength(3)
  })

  it('returns all collections', () => {
    store.set('/pages/blog', makeCollection('/pages/blog'))
    store.set('/pages/docs', makeCollection('/pages/docs'))

    const all = store.getAll()

    expect(all).toHaveLength(2)
  })

  it('deletes a collection', () => {
    store.set('/pages/blog', makeCollection('/pages/blog'))

    const deleted = store.delete('/pages/blog')

    expect(deleted).toBe(true)
    expect(store.has('/pages/blog')).toBe(false)
  })

  it('returns false when deleting a non-existent collection', () => {
    expect(store.delete('/pages/missing')).toBe(false)
  })

  it('clears all collections', () => {
    store.set('/pages/blog', makeCollection('/pages/blog'))
    store.set('/pages/docs', makeCollection('/pages/docs'))

    store.clear()

    expect(store.getAll()).toEqual([])
    expect(store.has('/pages/blog')).toBe(false)
    expect(store.has('/pages/docs')).toBe(false)
  })

  describe('toSerializable', () => {
    it('returns empty object when store is empty', () => {
      expect(store.toSerializable()).toEqual({})
    })

    it('serializes collections without lineMap', () => {
      store.set('/pages/blog', makeCollection('/pages/blog', 2))

      const serialized = store.toSerializable()

      expect(Object.keys(serialized)).toEqual(['/pages/blog'])
      expect(serialized['/pages/blog'].entries).toHaveLength(2)

      const entry = serialized['/pages/blog'].entries[0]
      expect(entry).toHaveProperty('filePath')
      expect(entry).toHaveProperty('frontmatter')
      expect(entry).toHaveProperty('content')
      expect(entry).not.toHaveProperty('lineMap')
    })

    it('preserves frontmatter data in serialized output', () => {
      store.set('/pages/blog', makeCollection('/pages/blog', 1))

      const serialized = store.toSerializable()
      const entry = serialized['/pages/blog'].entries[0]

      expect(entry.frontmatter).toEqual({ title: 'Post 0', index: 0 })
      expect(entry.filePath).toBe('/pages/blog/post-0.md')
      expect(entry.content).toBe('Content of post 0')
    })

    it('serializes multiple collections', () => {
      store.set('/pages/blog', makeCollection('/pages/blog', 1))
      store.set('/pages/docs', makeCollection('/pages/docs', 3))

      const serialized = store.toSerializable()

      expect(Object.keys(serialized)).toHaveLength(2)
      expect(serialized['/pages/blog'].entries).toHaveLength(1)
      expect(serialized['/pages/docs'].entries).toHaveLength(3)
    })
  })
})

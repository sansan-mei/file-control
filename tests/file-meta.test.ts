import { describe, expect, it } from 'vitest'
import { countFiles, fileKind, formatUploadTime, hasSearchMatch, parseFolderDate } from '../src/utils/fileMeta'
import { fileUrl } from '../src/utils'

describe('file metadata helpers', () => {
  it('maps extensions to icon kinds case-insensitively', () => {
    expect(fileKind('photo.JPG')).toBe('image')
    expect(fileKind('clip.mov')).toBe('video')
    expect(fileKind('song.flac')).toBe('audio')
    expect(fileKind('invoice.pdf')).toBe('pdf')
    expect(fileKind('backup.tar.gz')).toBe('archive')
    expect(fileKind('main.ts')).toBe('code')
    expect(fileKind('notes.md')).toBe('text')
    expect(fileKind('report.docx')).toBe('document')
    expect(fileKind('README')).toBe('other')
    expect(fileKind('.env')).toBe('other')
    expect(fileKind('trailing.')).toBe('other')
  })

  it('parses only valid YYYY-M-D upload folder names', () => {
    expect(parseFolderDate('2026-11-7')?.getDate()).toBe(7)
    expect(parseFolderDate('alpha')).toBeNull()
    expect(parseFolderDate('2026-2-30')).toBeNull()
  })

  it('shows only the time when the folder already gives the date', () => {
    const uploaded = new Date(2026, 10, 7, 9, 5).getTime()
    expect(formatUploadTime(uploaded, '2026-11-7')).toBe('09:05')
    expect(formatUploadTime(uploaded, '2026-11-6')).toBe('2026-11-07 09:05')
    expect(formatUploadTime(uploaded)).toBe('2026-11-07 09:05')
  })

  it('counts nested files and matches search like the tree filter', () => {
    const tree = [
      { key: 'a', label: '2026-11-7', isFile: false, children: [
        { key: 'b', label: 'a.txt', isFile: true },
        { key: 'c', label: 'sub', isFile: false, children: [{ key: 'd', label: 'deep.png', isFile: true }] }
      ] }
    ]
    expect(countFiles(tree[0])).toBe(2)
    expect(hasSearchMatch(tree, 'deep')).toBe(true)
    expect(hasSearchMatch(tree, '2026')).toBe(true)
    expect(hasSearchMatch(tree, 'missing')).toBe(false)
    expect(hasSearchMatch(tree, '')).toBe(true)
  })

  it('builds file URLs with an optional encoded password segment', () => {
    expect(fileUrl({ key: 'k', label: '报告 1.pdf' })).toBe('/api/check-file/k/%E6%8A%A5%E5%91%8A%201.pdf')
    expect(fileUrl({ key: 'k', label: 'a.pdf' }, 'p#1')).toBe('/api/check-file/k/a.pdf/p%231')
  })
})

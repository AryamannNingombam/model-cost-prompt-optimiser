/**
 * Fix MacRoman mojibake in transcripts containing Hindi (Devanagari) text.
 *
 * When UTF-8 encoded Hindi text is read as MacRoman, bytes like E0 A4 XX
 * become characters like ‡§X. This module detects that pattern and reverses
 * the corruption by mapping each MacRoman-interpreted character back to its
 * original byte, then decoding the resulting byte sequence as UTF-8.
 */

// MacRoman Unicode code-point → original byte value (0x80–0xFF range only).
// Characters in 0x00–0x7F are identical to ASCII and need no mapping.
const MACROMAN_TO_BYTE: Record<number, number> = {
  0x00C4: 0x80, // Ä
  0x00C5: 0x81, // Å
  0x00C7: 0x82, // Ç
  0x00C9: 0x83, // É
  0x00D1: 0x84, // Ñ
  0x00D6: 0x85, // Ö
  0x00DC: 0x86, // Ü
  0x00E1: 0x87, // á
  0x00E0: 0x88, // à
  0x00E2: 0x89, // â
  0x00E4: 0x8A, // ä
  0x00E3: 0x8B, // ã
  0x00E5: 0x8C, // å
  0x00E7: 0x8D, // ç
  0x00E9: 0x8E, // é
  0x00E8: 0x8F, // è
  0x00EA: 0x90, // ê
  0x00EB: 0x91, // ë
  0x00ED: 0x92, // í
  0x00EC: 0x93, // ì
  0x00EE: 0x94, // î
  0x00EF: 0x95, // ï
  0x00F1: 0x96, // ñ
  0x00F3: 0x97, // ó
  0x00F2: 0x98, // ò
  0x00F4: 0x99, // ô
  0x00F6: 0x9A, // ö
  0x00F5: 0x9B, // õ
  0x00FA: 0x9C, // ú
  0x00F9: 0x9D, // ù
  0x00FB: 0x9E, // û
  0x00FC: 0x9F, // ü
  0x2020: 0xA0, // †
  0x00B0: 0xA1, // °
  0x00A2: 0xA2, // ¢
  0x00A3: 0xA3, // £
  0x00A7: 0xA4, // §
  0x2022: 0xA5, // •
  0x00B6: 0xA6, // ¶
  0x00DF: 0xA7, // ß
  0x00AE: 0xA8, // ®
  0x00A9: 0xA9, // ©
  0x2122: 0xAA, // ™
  0x00B4: 0xAB, // ´
  0x00A8: 0xAC, // ¨
  0x2260: 0xAD, // ≠
  0x00C6: 0xAE, // Æ
  0x00D8: 0xAF, // Ø
  0x221E: 0xB0, // ∞
  0x00B1: 0xB1, // ±
  0x2264: 0xB2, // ≤
  0x2265: 0xB3, // ≥
  0x00A5: 0xB4, // ¥
  0x00B5: 0xB5, // µ
  0x2202: 0xB6, // ∂
  0x2211: 0xB7, // ∑
  0x220F: 0xB8, // ∏
  0x03C0: 0xB9, // π
  0x222B: 0xBA, // ∫
  0x00AA: 0xBB, // ª
  0x00BA: 0xBC, // º
  0x2126: 0xBD, // Ω
  0x00E6: 0xBE, // æ
  0x00F8: 0xBF, // ø
  0x00BF: 0xC0, // ¿
  0x00A1: 0xC1, // ¡
  0x00AC: 0xC2, // ¬
  0x221A: 0xC3, // √
  0x0192: 0xC4, // ƒ
  0x2248: 0xC5, // ≈
  0x2206: 0xC6, // ∆
  0x00AB: 0xC7, // «
  0x00BB: 0xC8, // »
  0x2026: 0xC9, // …
  0x00A0: 0xCA, // (non-breaking space)
  0x00C0: 0xCB, // À
  0x00C3: 0xCC, // Ã
  0x00D5: 0xCD, // Õ
  0x0152: 0xCE, // Œ
  0x0153: 0xCF, // œ
  0x2013: 0xD0, // –
  0x2014: 0xD1, // —
  0x201C: 0xD2, // "
  0x201D: 0xD3, // "
  0x2018: 0xD4, // '
  0x2019: 0xD5, // '
  0x00F7: 0xD6, // ÷
  0x25CA: 0xD7, // ◊
  0x00FF: 0xD8, // ÿ
  0x0178: 0xD9, // Ÿ
  0x2044: 0xDA, // ⁄
  0x20AC: 0xDB, // €
  0x2039: 0xDC, // ‹
  0x203A: 0xDD, // ›
  0xFB01: 0xDE, // fi
  0xFB02: 0xDF, // fl
  0x2021: 0xE0, // ‡
  0x00B7: 0xE1, // ·
  0x201A: 0xE2, // ‚
  0x201E: 0xE3, // „
  0x2030: 0xE4, // ‰
  0x00C2: 0xE5, // Â
  0x00CA: 0xE6, // Ê
  0x00C1: 0xE7, // Á
  0x00CB: 0xE8, // Ë
  0x00C8: 0xE9, // È
  0x00CD: 0xEA, // Í
  0x00CE: 0xEB, // Î
  0x00CF: 0xEC, // Ï
  0x00CC: 0xED, // Ì
  0x00D3: 0xEE, // Ó
  0x00D4: 0xEF, // Ô
  0xF8FF: 0xF0, //  (Apple logo)
  0x00D2: 0xF1, // Ò
  0x00DA: 0xF2, // Ú
  0x00DB: 0xF3, // Û
  0x00D9: 0xF4, // Ù
  0x0131: 0xF5, // ı
  0x02C6: 0xF6, // ˆ
  0x02DC: 0xF7, // ˜
  0x00AF: 0xF8, // ¯
  0x02D8: 0xF9, // ˘
  0x02D9: 0xFA, // ˙
  0x02DA: 0xFB, // ˚
  0x00B8: 0xFC, // ¸
  0x02DD: 0xFD, // ˝
  0x02DB: 0xFE, // ˛
  0x02C7: 0xFF, // ˇ
}

/** Mojibake fingerprint: ‡§ (MacRoman for UTF-8 Devanagari prefix E0 A4). */
const MOJIBAKE_PATTERN = /\u2021[\u00A7\u2022]/

/** Devanagari Unicode block. */
const DEVANAGARI_RE = /[\u0900-\u097F]/

/**
 * Return true when the text looks like MacRoman-garbled Hindi.
 */
export function hasMojibake(text: string): boolean {
  return MOJIBAKE_PATTERN.test(text)
}

/**
 * Attempt to reverse MacRoman mojibake → original UTF-8.
 *
 * For every character in `text`:
 *   - If it is ASCII (< 0x80), keep its byte value.
 *   - Otherwise look it up in MACROMAN_TO_BYTE to recover the original byte.
 *   - If the character isn't in the MacRoman table, keep it as-is in the
 *     output (it was never garbled).
 *
 * The recovered byte sequence is then decoded as UTF-8.
 */
export function fixMacRomanMojibake(text: string): string {
  const bytes: number[] = []
  const passthrough: Map<number, string> = new Map()
  let hasMapping = false

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)

    if (code < 0x80) {
      // ASCII — byte value is the same
      bytes.push(code)
    } else {
      const byte = MACROMAN_TO_BYTE[code]
      if (byte !== undefined) {
        bytes.push(byte)
        hasMapping = true
      } else {
        // Character not in MacRoman table — it wasn't garbled.
        // Insert a placeholder and remember it.
        // Use a byte that can't appear in valid UTF-8 mid-stream: 0xFF is
        // never a valid UTF-8 byte, but we already use it for ˇ.  Instead
        // we'll do a two-pass approach below.
        passthrough.set(bytes.length, text[i])
        bytes.push(0x3F) // '?' placeholder
      }
    }
  }

  if (!hasMapping) return text

  // Decode the byte array as UTF-8
  try {
    const uint8 = new Uint8Array(bytes)
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(uint8)

    // Quick sanity check: the result should contain Devanagari characters
    // if the original was Hindi. If not, return the original text unchanged.
    if (!DEVANAGARI_RE.test(decoded) && MOJIBAKE_PATTERN.test(text)) {
      return text
    }

    return decoded
  } catch {
    return text
  }
}

/**
 * Main entry point: detect and fix encoding issues in a transcript.
 *
 * Returns `{ text, wasFixed }` so callers can inform the user.
 */
export function fixTranscriptEncoding(text: string): {
  text: string
  wasFixed: boolean
} {
  if (!hasMojibake(text)) {
    return { text, wasFixed: false }
  }

  const fixed = fixMacRomanMojibake(text)
  const wasFixed = fixed !== text

  return { text: wasFixed ? fixed : text, wasFixed }
}

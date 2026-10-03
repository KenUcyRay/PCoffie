<?php

namespace App\Models;

// Sanitasi HTML terbatas untuk isi berita (tanpa library tambahan).
// Diizinkan: paragraf, judul, tebal, miring, daftar, tautan http/https,
// gambar dari unggahan sendiri, kutipan. Dibuang: <script>/<style> (+isi),
// atribut event (on*), href javascript:/data:, src selain uploads/, dan
// semua tag/atribut lain (tag dibuang, teks isi dipertahankan).
class NewsHtml
{
    const ALLOWED_TAGS = [
        'p', 'h1', 'h2', 'h3', 'h4', 'b', 'strong', 'i', 'em', 'u',
        'ul', 'ol', 'li', 'blockquote', 'br', 'hr', 'a', 'img',
    ];

    const ALLOWED_ATTRS = [
        '*' => [],
        'a' => ['href', 'title'],
        'img' => ['src', 'alt', 'width', 'height'],
    ];

    public static function sanitize(?string $html): string
    {
        $html = (string) $html;
        if (trim($html) === '') {
            return '';
        }
        // Buang <script> dan <style> beserta isinya.
        $html = preg_replace('#<(script|style)\b[^>]*>.*?</\1\s*>#is', '', $html);

        return preg_replace_callback(
            '#<(/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>#',
            function ($m) {
                $closing = $m[1] === '/';
                $tag = strtolower($m[2]);
                if (!in_array($tag, self::ALLOWED_TAGS, true)) {
                    return '';
                }
                if ($closing) {
                    return '</' . $tag . '>';
                }
                $attrs = self::filterAttrs($tag, $m[3] ?? '');
                // Tag void: br, hr, img.
                if (in_array($tag, ['br', 'hr', 'img'], true)) {
                    return '<' . $tag . $attrs . '>';
                }
                return '<' . $tag . $attrs . '>';
            },
            $html
        );
    }

    private static function filterAttrs(string $tag, string $raw): string
    {
        $allowed = array_merge(
            self::ALLOWED_ATTRS['*'],
            self::ALLOWED_ATTRS[$tag] ?? []
        );
        if (empty($allowed)) {
            return '';
        }
        $out = '';
        preg_match_all(
            '/([a-zA-Z][a-zA-Z0-9\-]*)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+)))?/',
            $raw,
            $am,
            PREG_SET_ORDER
        );
        foreach ($am as $a) {
            $name = strtolower($a[1]);
            // Atribut event (on*) tidak pernah diizinkan.
            if (strpos($name, 'on') === 0 || !in_array($name, $allowed, true)) {
                continue;
            }
            $val = $a[2] ?? $a[3] ?? $a[4] ?? '';
            if ($tag === 'a' && $name === 'href') {
                // Hanya tautan http/https.
                if (!preg_match('#^https?://#i', trim($val))) {
                    continue;
                }
            }
            if ($tag === 'img' && $name === 'src') {
                // Hanya gambar dari unggahan sendiri.
                if (!preg_match('#^uploads/#', trim($val))) {
                    continue;
                }
            }
            $out .= ' ' . $name . '="' . htmlspecialchars($val, ENT_QUOTES, 'UTF-8') . '"';
        }
        return $out;
    }
}

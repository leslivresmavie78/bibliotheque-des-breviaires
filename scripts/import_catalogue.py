#!/usr/bin/env python3
"""Crée le catalogue public à partir d'un export Book Catalogue, sans dépendance."""
import argparse
import csv
import datetime
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

FIELDS = ['_id', 'title', 'author_details', 'isbn', 'rating', 'series_details', 'pages', 'description', 'notes', 'genre', 'date_added', 'literary_awards']


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1
        elif not self.skip and tag in ('br', 'p', 'div', 'li'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip = max(0, self.skip - 1)
        elif not self.skip and tag in ('p', 'div', 'li'):
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def plain(value):
    parser = PlainText()
    parser.feed(value)
    return re.sub(r'\n[ \t]*\n(?:[ \t]*\n)+', '\n\n', ''.join(parser.parts)).strip()


def extract_literary_awards(location):
    """Ne publie que les lignes marquées comme prix remportés, jamais le rangement."""
    text = re.sub(r'\\+r?\\+n|\\+n', '\n', plain(location or ''))
    awards = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith('🏆'):
            continue
        for value in line.split('🏆')[1:]:
            award = value.strip()
            if award and not re.search(r'\b(finaliste|s[ée]lection|nomm[ée])\b', award, re.IGNORECASE) and award not in awards:
                awards.append(award)
    return '\n'.join(awards)


def public_series(row):
    """Retire l'identifiant d'import Android, en conservant nom et numéro."""
    value = (row.get('series_details') or '').strip()
    reference = (row.get('series_uuids') or '').strip()
    if not value:
        if reference:
            raise ValueError('Série référencée sans nom : ' + row.get('_id', ''))
        return ''
    encoded = re.fullmatch(r'([0-9a-fA-F-]{36}),\s*(.+)', value)
    if encoded:
        if reference and reference != encoded.group(1):
            raise ValueError('Référence de série incohérente : ' + row.get('_id', ''))
        return encoded.group(2).strip()
    if re.fullmatch(r'[0-9a-fA-F-]{36}', value):
        raise ValueError('Identifiant de série sans nom : ' + row.get('_id', ''))
    return value


def convert(source, destination):
    raw = source.read_bytes()
    text = raw.decode('utf-8-sig')
    dialect = csv.Sniffer().sniff(text[:20000], delimiters=',;\t')
    reader = csv.DictReader(text.splitlines(keepends=True), dialect=dialect)
    required = {'_id', 'title', 'author_details', 'genre', 'description', 'notes'}
    if not required.issubset(set(reader.fieldnames or [])):
        raise ValueError('Ce fichier ne contient pas les colonnes attendues de Book Catalogue.')
    books = []
    ids = set()
    for number, row in enumerate(reader, 2):
        if not any(str(v).strip() for v in row.values() if v):
            continue
        book = {key: row.get(key, '').strip() for key in FIELDS}
        if not book['_id'] or not book['title']:
            raise ValueError(f'Identifiant ou titre manquant, ligne {number}.')
        if book['_id'] in ids:
            raise ValueError(f"Identifiant en double : {book['_id']}.")
        ids.add(book['_id'])
        for key in ('description', 'notes'):
            book[key] = plain(book[key])
        book['literary_awards'] = extract_literary_awards(row.get('location', ''))
        book['series_details'] = public_series(row)
        books.append(book)
    if not books:
        raise ValueError('Le catalogue est vide.')
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / 'catalogue.csv'
    temporary = target.with_suffix('.tmp')
    with temporary.open('w', encoding='utf-8', newline='') as output:
        writer = csv.DictWriter(output, fieldnames=FIELDS, lineterminator='\n')
        writer.writeheader()
        writer.writerows(books)
    temporary.replace(target)
    metadata = {
        'imported_on': datetime.date.today().isoformat(),
        'source_name': source.name,
        'count': len(books),
        'source_sha256': hashlib.sha256(raw).hexdigest(),
        'public_fields': FIELDS,
    }
    (destination / 'catalogue-meta.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'books': len(books), 'output': str(target), 'with_reviews': sum(bool(b['notes']) for b in books), 'with_awards': sum(bool(b['literary_awards']) for b in books)}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--destination', type=Path, default=Path(__file__).resolve().parents[1] / 'dist')
    args = parser.parse_args()
    convert(args.source, args.destination)

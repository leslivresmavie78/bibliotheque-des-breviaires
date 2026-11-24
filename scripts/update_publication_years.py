#!/usr/bin/env python3
"""Rapproche les années d'œuvres Open Library par ISBN, sans modifier le CSV."""
import argparse
import csv
import datetime
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo


def normalized(value):
    text = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()


def clean_isbn(value):
    value = re.sub(r'[^0-9X]', '', (value or '').upper())
    if len(value) == 13 and value.isdigit():
        return value if sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(value)) % 10 == 0 else ''
    if len(value) == 10 and value[:9].isdigit():
        return value if sum((10 - i) * (10 if c == 'X' else int(c)) for i, c in enumerate(value)) % 11 == 0 else ''
    return ''


def matching_year(row, candidates, today_year):
    """Refuse ISBN ambigus, auteurs incompatibles, dates absentes ou incohérentes."""
    isbn = clean_isbn(row.get('isbn'))
    if not isbn:
        return None
    names = [normalized(name.split(',')[0]) for name in row['author_details'].split('|') if name.strip()]
    candidates = [doc for doc in candidates if isbn in doc.get('isbn', [])]
    works = {doc.get('key') for doc in candidates}
    if len(works) != 1:
        return None
    doc = candidates[0]
    title = lambda value: re.sub(r'\broman$', '', normalized(value)).strip()
    if title(row['title']) != title(doc.get('title', '')):
        return None
    authors = ' '.join(normalized(name) for name in doc.get('author_name', []))
    if not any(name and re.search(r'\b' + re.escape(name) + r'\b', authors) for name in names):
        return None
    year = doc.get('first_publish_year')
    if not isinstance(year, int) or isinstance(year, bool) or not 1450 <= year <= today_year:
        return None
    if not re.fullmatch(r'/works/OL\d+W', doc.get('key', '')):
        return None
    edition = re.match(r'^(\d{4})(?:-|$)', row.get('date_published', ''))
    if edition and year > int(edition[1]):
        return None
    return {'isbn': row['isbn'], 'title': row['title'], 'author_details': row['author_details'], 'year': year, 'source': 'https://openlibrary.org' + doc['key']}


def needs_manual_review(row, year):
    # Les notices très anciennes et les écarts importants ont livré des dates
    # incohérentes : ils restent à vérifier dans une source éditoriale.
    edition = re.match(r'^(\d{4})', row.get('date_published', ''))
    prize_years = [int(value) for value in re.findall(r'\b(?:19|20)\d{2}\b', row.get('literary_awards', ''))]
    return year <= 1960 or bool(edition and int(edition[1]) - year >= 30) or bool(prize_years and year > min(prize_years))


def update(catalogue, source, output, cache):
    with catalogue.open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream))
    with source.open(encoding='utf-8-sig', newline='') as stream:
        source_rows = {row['_id']: row for row in csv.DictReader(stream)}
    for row in rows:
        original = source_rows.get(row['_id'], {})
        if clean_isbn(original.get('isbn')) == clean_isbn(row.get('isbn')):
            row['date_published'] = original.get('date_published', '')
    isbns = sorted({clean_isbn(row.get('isbn')) for row in rows} - {''})
    cache.mkdir(parents=True, exist_ok=True)
    candidates = []
    errors = []
    for index in range(0, len(isbns), 60):
        batch = isbns[index:index + 60]
        query = 'isbn:(' + ' OR '.join(batch) + ')'
        key = cache / f'{index // 60:03d}.json'
        try:
            if key.exists():
                data = json.loads(key.read_text())
                if data.get('q') != query:
                    raise ValueError('Le cache ne correspond pas à la requête.')
            else:
                parameters = urllib.parse.urlencode({'q': query, 'fields': 'key,title,author_name,first_publish_year,isbn', 'limit': 1000})
                request = urllib.request.Request('https://openlibrary.org/search.json?' + parameters, headers={'User-Agent': 'BibliothequeCatalogue/1.0 (public bibliographic metadata)'})
                with urllib.request.urlopen(request, timeout=40) as response:
                    data = json.load(response)
                if data.get('numFound', 0) > len(data.get('docs', [])):
                    raise ValueError('Résultats tronqués ; ne pas utiliser cette réponse.')
                key.write_text(json.dumps(data, ensure_ascii=False))
                time.sleep(1.1)
            candidates.extend(data.get('docs', []))
            print(f"ISBN {min(index + 60, len(isbns))}/{len(isbns)} : {len(data.get('docs', []))} notices", flush=True)
        except Exception as error:
            errors.append({'batch': index // 60, 'error': str(error)})
            print(f'Lot {index // 60} non résolu : {error}', flush=True)
    by_isbn = {}
    for candidate in candidates:
        for isbn in candidate.get('isbn', []):
            by_isbn.setdefault(isbn, {})[candidate['key']] = candidate
    today = datetime.datetime.now(ZoneInfo('Europe/Paris')).date()
    books = {}
    for row in rows:
        result = matching_year(row, list(by_isbn.get(clean_isbn(row.get('isbn')), {}).values()), today.year)
        if result and not needs_manual_review(row, result['year']):
            books[row['_id']] = result
    data = {'checked_on': today.isoformat(), 'description': 'Première année connue de l’œuvre, langue originale comprise. Rapprochement exact ISBN, titre et auteur. Les ambiguïtés, dates anciennes et grands écarts non revus restent sans année ; les compléments éditoriaux sont prioritaires.', 'books': books}
    overrides_path = Path(__file__).with_name('publication-year-overrides.json')
    if overrides_path.exists():
        overrides = json.loads(overrides_path.read_text())
        for row in rows:
            entry = overrides.get(row['_id'])
            if entry and all(entry.get(key) == row.get(key) for key in ['isbn', 'title', 'author_details']):
                if not isinstance(entry.get('year'), int) or not 1450 <= entry['year'] <= today.year or not str(entry.get('source', '')).startswith('https://'):
                    raise ValueError('Complément bibliographique invalide : ' + row['_id'])
                books[row['_id']] = entry
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'books_with_year': len(books), 'books_without_year': len(rows) - len(books), 'errors': errors}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('catalogue', type=Path)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--cache', type=Path, required=True)
    args = parser.parse_args()
    update(args.catalogue, args.source, args.output, args.cache)

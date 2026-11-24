import unittest
from import_catalogue import extract_literary_awards, public_series
from update_publication_years import matching_year, clean_isbn, needs_manual_review


class AwardsImportTest(unittest.TestCase):
    def test_only_awards_are_public(self):
        location = 'Étagère 2\n🏆 Prix des Libraires 2022\n📌 Finaliste du Prix du roman Fnac 2021\n📈 Best-seller'
        self.assertEqual(extract_literary_awards(location), 'Prix des Libraires 2022')

    def test_original_labels_and_line_breaks(self):
        expected = 'Prix des Libraires 2002\nGrand Prix des lectrices de ELLE 2002 – policier'
        for separator in ['\n', '\r\n', r'\n', r'\\n', r'\r\n', '<br /><br />']:
            location = '🏆 Prix des Libraires 2002' + separator + '🏆 Grand Prix des lectrices de ELLE 2002 – policier'
            self.assertEqual(extract_literary_awards(location), expected, separator)

    def test_no_prize_inferred_from_selection_or_unmarked_text(self):
        for location in ['', None, 'Prix de vente 12 €', '📌 Sélection Prix Renaudot 2025', '🏆 Finaliste du prix 2025', '📈 Best-seller']:
            self.assertEqual(extract_literary_awards(location), '')

    def test_multiple_awards_on_one_line(self):
        location = 'Étagère 2\n🏆 Prix des Libraires 2002 🏆 Grand Prix des Lectrices de Elle 2002 — policier'
        self.assertEqual(extract_literary_awards(location), 'Prix des Libraires 2002\nGrand Prix des Lectrices de Elle 2002 — policier')
        self.assertEqual(extract_literary_awards('🏆 Finaliste du prix 2025 🏆 Prix des Libraires 2025'), 'Prix des Libraires 2025')


class SeriesImportTest(unittest.TestCase):
    def test_android_reference_is_private_and_volume_is_preserved(self):
        reference = '33138457-a414-46f3-af8e-2cb0815e20a1'
        row = {'_id': '631', 'series_uuids': reference,
               'series_details': reference + ', Trilogie des ombres (2)'}
        self.assertEqual(public_series(row), 'Trilogie des ombres (2)')
        self.assertEqual(public_series({'series_details': 'Ariol (4)'}), 'Ariol (4)')
        self.assertEqual(public_series({'series_details': '', 'series_uuids': ''}), '')

    def test_unresolved_or_inconsistent_references_stop_publication(self):
        reference = '33138457-a414-46f3-af8e-2cb0815e20a1'
        for row in [
            {'series_details': '', 'series_uuids': reference},
            {'series_details': reference},
            {'series_details': reference + ', Ariol (4)', 'series_uuids': 'autre'},
        ]:
            with self.assertRaises(ValueError):
                public_series(row)


class PublicationYearTest(unittest.TestCase):
    def setUp(self):
        self.row = {'isbn': '9782070368228', 'title': 'Un livre', 'author_details': 'Camus, Albert', 'date_published': '2020'}
        self.doc = {'title': 'Un livre', 'isbn': ['9782070368228'], 'author_name': ['Albert Camus'], 'first_publish_year': 1942, 'key': '/works/OL1W'}

    def test_a_work_year_is_not_replaced_with_the_edition_year(self):
        self.assertEqual(matching_year(self.row, [self.doc], 2026)['year'], 1942)
        self.assertIsNone(matching_year(self.row, [{**self.doc, 'first_publish_year': 2025}], 2026))
        self.assertIsNone(matching_year(self.row, [{**self.doc, 'first_publish_year': 2030}], 2026))

    def test_ambiguous_isbn_or_wrong_author_is_rejected(self):
        self.assertIsNone(matching_year(self.row, [self.doc, {**self.doc, 'key': '/works/OL2W'}], 2026))
        self.assertIsNone(matching_year(self.row, [{**self.doc, 'author_name': ['Autre auteur']}], 2026))
        self.assertIsNone(matching_year(self.row, [{**self.doc, 'title': 'Un autre tome'}], 2026))
        self.assertIsNone(matching_year(self.row, [{**self.doc, 'first_publish_year': None}], 2026))
        self.assertEqual(clean_isbn('978-2-07-036822-8'), '9782070368228')
        self.assertEqual(clean_isbn('9782070368229'), '')

    def test_suspicious_years_need_editorial_review(self):
        self.assertTrue(needs_manual_review(self.row, 1721))
        self.assertTrue(needs_manual_review(self.row, 1900))
        self.assertTrue(needs_manual_review(self.row, 1980))
        self.assertFalse(needs_manual_review(self.row, 2000))
        self.assertTrue(needs_manual_review({**self.row, 'literary_awards': 'Prix Goncourt 2010'}, 2012))


if __name__ == '__main__':
    unittest.main()

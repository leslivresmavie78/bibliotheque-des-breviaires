import unittest
from import_catalogue import extract_literary_awards


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


if __name__ == '__main__':
    unittest.main()

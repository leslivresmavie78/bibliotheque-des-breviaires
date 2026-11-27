from pathlib import Path
import hashlib
import json
import stat
import tempfile
import unittest
import zipfile
from build_covers import build, jpeg_dimensions


class CoverBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'scripts').mkdir()
        self.data = (Path(__file__).resolve().parents[1] / 'dist/book-cover-9782080510655.jpg').read_bytes()
        self.name = hashlib.sha256(self.data).hexdigest() + '.jpg'
        self.width, self.height = jpeg_dimensions(self.data)
        self.write_fixture()

    def write_fixture(self, name=None, width=None, extra=False, symlink=False):
        name = name or self.name
        path = self.root / 'book-covers-01.zip'
        with zipfile.ZipFile(path,'w') as bundle:
            info = zipfile.ZipInfo(name)
            if symlink:
                info.external_attr = (stat.S_IFLNK | 0o777) << 16
            bundle.writestr(info,self.data)
            if extra:
                bundle.writestr('non-declare.jpg',self.data)
        self.index = {'schema_version':1,'unique_images':1,'archives':[{'file':path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'images':{name:{'bytes':len(self.data),'width':width if width is not None else self.width,'height':self.height}}}]}
        self.save_index()

    def save_index(self):
        (self.root / 'scripts/cover-archives.json').write_text(json.dumps(self.index))

    def test_extracts_original_bytes_and_dimensions(self):
        self.assertEqual(build(self.root),1)
        self.assertEqual((self.root / 'dist/book-covers' / self.name).read_bytes(),self.data)
        self.assertEqual((self.width,self.height),(290,451))

    def test_rejects_modified_archive(self):
        self.index['archives'][0]['sha256'] = '0' * 64
        self.save_index()
        with self.assertRaisesRegex(ValueError,'Empreinte'): build(self.root)

    def test_rejects_unlisted_file(self):
        self.write_fixture(extra=True)
        with self.assertRaisesRegex(ValueError,'inattendu'): build(self.root)

    def test_rejects_path_traversal(self):
        self.write_fixture(name='../echappe.jpg')
        with self.assertRaisesRegex(ValueError,'Chemin'): build(self.root)
        self.assertFalse((self.root / 'dist/echappe.jpg').exists())

    def test_rejects_wrong_image_identity(self):
        self.write_fixture(name='0' * 64 + '.jpg')
        with self.assertRaisesRegex(ValueError,'Identité'): build(self.root)

    def test_rejects_wrong_dimensions(self):
        self.write_fixture(width=self.width+1)
        with self.assertRaisesRegex(ValueError,'dimensions JPEG/PNG/WebP'): build(self.root)

    def test_rejects_symbolic_link(self):
        self.write_fixture(symlink=True)
        with self.assertRaisesRegex(ValueError,'type de fichier'): build(self.root)

    def test_rejects_boolean_dimension(self):
        self.write_fixture(width=True)
        with self.assertRaisesRegex(ValueError,'Dimensions'): build(self.root)

    def test_rejects_missing_image(self):
        self.index['archives'][0]['images']['1'*64+'.jpg'] = {'bytes':1,'width':1,'height':1}
        self.save_index()
        with self.assertRaisesRegex(ValueError,'incomplet'): build(self.root)

    def use_parts(self):
        data = (self.root / 'book-covers-01.zip').read_bytes()
        self.parts = [data[:100],data[100:]]
        names = ['book-covers-01-001.part','book-covers-01-002.part']
        for name,payload in zip(names,self.parts): (self.root / name).write_bytes(payload)
        self.index['archives'][0]['parts'] = [{'file':name,'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()} for name,payload in zip(names,self.parts)]
        self.save_index()

    def test_builds_archive_from_small_parts(self):
        self.use_parts()
        self.assertEqual(build(self.root),1)
        self.assertEqual((self.root / 'dist/book-covers' / self.name).read_bytes(),self.data)

    def test_rejects_corrupted_part(self):
        self.use_parts()
        (self.root / 'book-covers-01-002.part').write_bytes(b'corrupted')
        with self.assertRaisesRegex(ValueError,'segment'): build(self.root)

    def test_rejects_outside_part_path(self):
        self.use_parts()
        self.index['archives'][0]['parts'][0]['file'] = '../outside.part'
        self.save_index()
        with self.assertRaisesRegex(ValueError,'Nom de segment'): build(self.root)


if __name__ == '__main__': unittest.main()

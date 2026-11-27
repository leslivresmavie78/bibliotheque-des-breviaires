"""Build the original public images from the checked cover archives."""
from pathlib import Path
import hashlib
import io
import json
import re
import stat
import struct
import zipfile


def jpeg_dimensions(data):
    if data[:2] != b'\xff\xd8':
        raise ValueError('Image JPEG attendue.')
    position = 2
    while position < len(data):
        if data[position] != 255:
            raise ValueError('En-tête JPEG invalide.')
        while position < len(data) and data[position] == 255:
            position += 1
        marker = data[position]
        position += 1
        if marker in {0xD8,0xD9,0x01} or 0xD0 <= marker <= 0xD7:
            continue
        length = struct.unpack('>H', data[position:position+2])[0]
        if length < 2 or position + length > len(data):
            raise ValueError('Segment JPEG incomplet.')
        if marker in {0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF}:
            height, width = struct.unpack('>HH', data[position+3:position+7])
            return width, height
        if marker == 0xDA:
            break
        position += length
    raise ValueError('Dimensions JPEG absentes.')


def image_info(data):
    if data[:2] == b'\xff\xd8':
        return (*jpeg_dimensions(data),'jpg')
    if data[:16] == b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR':
        return (*struct.unpack('>II',data[16:24]),'png')
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        chunk = data[12:16]
        if chunk == b'VP8 ' and data[23:26] == b'\x9d\x01\x2a':
            width,height = struct.unpack('<HH',data[26:30])
            return (width & 0x3fff,height & 0x3fff,'webp')
        if chunk == b'VP8L' and data[20] == 0x2f:
            bits = int.from_bytes(data[21:25],'little')
            return ((bits & 0x3fff)+1,((bits >> 14) & 0x3fff)+1,'webp')
        if chunk == b'VP8X':
            return (int.from_bytes(data[24:27],'little')+1,int.from_bytes(data[27:30],'little')+1,'webp')
    raise ValueError('Format d’image non reconnu.')


def build(root):
    root = Path(root)
    index = json.loads((root / 'scripts/cover-archives.json').read_text())
    if index.get('schema_version') != 1 or not index.get('archives'):
        raise ValueError('Inventaire des archives absent ou invalide.')
    written = set()
    target = root / 'dist/book-covers'
    target.mkdir(parents=True, exist_ok=True)
    for archive in index['archives']:
        if not re.fullmatch(r'book-covers-\d{2}\.zip', archive['file']):
            raise ValueError('Nom d’archive invalide.')
        if 'parts' in archive:
            if not archive['parts'] or len(archive['parts']) > 100:
                raise ValueError('Nombre de segments invalide.')
            chunks = []
            for part in archive['parts']:
                if not re.fullmatch(r'book-covers-\d{2}-\d{3}\.part',part['file']):
                    raise ValueError('Nom de segment invalide.')
                payload = (root / part['file']).read_bytes()
                if len(payload) != part['bytes'] or not 0 < len(payload) <= 2_000_000 or hashlib.sha256(payload).hexdigest() != part['sha256']:
                    raise ValueError('Empreinte de segment incorrecte.')
                chunks.append(payload)
            source = io.BytesIO(b''.join(chunks))
            checksum = hashlib.sha256(source.getbuffer()).hexdigest()
            size = source.getbuffer().nbytes
        else:
            source = root / archive['file']
            with source.open('rb') as stream:
                checksum = hashlib.file_digest(stream,'sha256').hexdigest()
            size = source.stat().st_size
        if size != archive['bytes'] or checksum != archive['sha256']:
            raise ValueError('Empreinte d’archive incorrecte.')
        with zipfile.ZipFile(source) as bundle:
            names = bundle.namelist()
            if len(set(names)) != len(names) or set(names) != set(archive['images']):
                raise ValueError('Contenu d’archive inattendu ou incomplet.')
            for info in bundle.infolist():
                if not re.fullmatch(r'[a-f0-9]{64}\.(?:jpg|png|webp)', info.filename) or stat.S_IFMT(info.external_attr >> 16) not in {0,stat.S_IFREG}:
                    raise ValueError('Chemin d’image ou type de fichier invalide.')
                if info.filename in written:
                    raise ValueError('Image répétée dans plusieurs archives.')
                expected = archive['images'][info.filename]
                if info.file_size != expected['bytes'] or not 0 < info.file_size <= 10_000_000:
                    raise ValueError('Taille d’image incorrecte.')
                if any(not isinstance(expected[key],int) or isinstance(expected[key],bool) or not 0 < expected[key] <= 4096 for key in ['width','height']):
                    raise ValueError('Dimensions d’image incorrectes.')
                data = bundle.read(info)
                if hashlib.sha256(data).hexdigest() != info.filename.split('.')[0] or image_info(data) != (expected['width'],expected['height'],info.filename.rsplit('.',1)[1]):
                    raise ValueError('Identité, format ou dimensions JPEG/PNG/WebP incorrects.')
                (target / info.filename).write_bytes(data)
                written.add(info.filename)
    if len(written) != index['unique_images']:
        raise ValueError('Nombre d’images incorrect.')
    return len(written)


if __name__ == '__main__':
    total = build(Path(__file__).resolve().parents[1])
    print(f'{total} fichiers de couvertures préparés pour le site.')

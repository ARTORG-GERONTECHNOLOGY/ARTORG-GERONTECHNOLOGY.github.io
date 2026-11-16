"""Decode uploaded images and inspect PDF objects; no files or network writes."""
import io
import json
import sys
import warnings
from PIL import Image
from pypdf import PdfReader
from pypdf.generic import IndirectObject, DictionaryObject, ArrayObject

try:
    rules = json.loads(sys.argv[1])
    kind = sys.argv[2]
    data = sys.stdin.buffer.read(rules['max_file_bytes'] + 1)
    if not data or len(data) > rules['max_file_bytes']:
        raise ValueError('The file is empty or exceeds the upload limit')
    if kind.startswith('image/'):
        Image.MAX_IMAGE_PIXELS = rules['max_image_pixels']
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            image = Image.open(io.BytesIO(data))
            if image.format != {'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WEBP'}[kind]:
                raise ValueError('Decoded image format disagrees with its type')
            width, height = image.size
            if not (0 < width <= rules['max_image_dimension'] and 0 < height <= rules['max_image_dimension']):
                raise ValueError('Image dimensions exceed the permitted limit')
            frames = getattr(image, 'n_frames', 1)
            if frames * width * height > rules['max_image_pixels']:
                raise ValueError('Image exceeds the decoded-pixel limit')
            image.verify()
            image = Image.open(io.BytesIO(data))
            for frame in range(frames):
                image.seek(frame)
                image.load()
        result = {'width': width, 'height': height}
    else:
        reader = PdfReader(io.BytesIO(data), strict=True)
        if reader.is_encrypted:
            raise ValueError('Encrypted PDFs cannot be checked; upload an unencrypted PDF')
        forbidden = {'/JS', '/JavaScript', '/AA', '/OpenAction', '/AcroForm', '/XFA', '/EmbeddedFiles', '/EmbeddedFile', '/EF', '/AF', '/RichMedia', '/Movie', '/Sound', '/3D', '/Launch', '/Collection'}
        visited = set()
        def inspect(value, depth=0):
            if depth > 80:
                raise ValueError('PDF object nesting exceeds the permitted limit')
            if isinstance(value, IndirectObject):
                identity = (value.idnum, value.generation)
                if identity in visited:
                    return
                visited.add(identity)
                value = value.get_object()
            if isinstance(value, DictionaryObject):
                if forbidden.intersection(value.keys()) or str(value.get('/Type')) == '/EmbeddedFile':
                    raise ValueError('PDF contains active content, forms or embedded files')
                if str(value.get('/S')) in {'/JavaScript', '/Launch', '/GoToR', '/GoToE', '/SubmitForm', '/ResetForm', '/ImportData', '/Rendition', '/Sound', '/Movie', '/Hide', '/SetOCGState', '/Trans', '/GoTo3DView', '/Thread', '/Named'}:
                    raise ValueError('PDF contains an unsupported action')
                if '/URI' in value and not str(value['/URI']).lower().startswith(('https://', 'http://', 'mailto:')):
                    raise ValueError('PDF contains an unsafe link')
                for item in value.values():
                    inspect(item, depth + 1)
            elif isinstance(value, ArrayObject):
                for item in value:
                    inspect(item, depth + 1)
        inspect(reader.trailer)
        # Inspect unreferenced objects as well, without decompressing content streams.
        for generation, objects in reader.xref.items():
            for object_id in objects:
                if object_id:
                    inspect(IndirectObject(object_id, generation, reader))
        for object_id in reader.xref_objStm:
            inspect(IndirectObject(object_id, 0, reader))
        if not len(reader.pages):
            raise ValueError('PDF must contain at least one page')
        result = {'pages': len(reader.pages)}
    print(json.dumps(result))
except Exception as error:
    if isinstance(error, (Image.DecompressionBombWarning, Image.DecompressionBombError)):
        message = 'Image exceeds the decoded-pixel limit'
    else:
        message = str(error) if isinstance(error, ValueError) else 'The file could not be decoded safely'
    print(json.dumps({'error': message}))

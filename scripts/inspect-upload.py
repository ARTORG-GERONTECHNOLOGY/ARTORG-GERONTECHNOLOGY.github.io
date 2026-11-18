"""Inspect uploads and optionally resize proposal figures in memory."""
import base64
import io
import json
import sys
import warnings
from PIL import Image, ImageOps
from pypdf import PdfReader
from pypdf.generic import IndirectObject, DictionaryObject, ArrayObject

try:
    rules = json.loads(sys.argv[1])
    kind = sys.argv[2]
    resize_figure = len(sys.argv) > 3 and sys.argv[3] == 'figure'
    data = sys.stdin.buffer.read(rules['max_file_bytes'] + 1)
    if not data or len(data) > rules['max_file_bytes']:
        raise ValueError('The file is empty or exceeds the upload limit')
    if kind.startswith('image/'):
        Image.MAX_IMAGE_PIXELS = rules['max_image_pixels']
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            image = Image.open(io.BytesIO(data))
            image_format = {'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WEBP'}[kind]
            if image.format != image_format:
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
            if resize_figure and max(width, height) > rules['max_figure_dimension']:
                if frames != 1:
                    raise ValueError('Choose a static image to resize this proposal figure')
                image = ImageOps.exif_transpose(image)
                image = image.convert('RGBA' if image.has_transparency_data else 'RGB')
                limit = rules['max_figure_dimension']
                # Always resample from the oriented original so retries retain detail.
                while limit >= 256:
                    scaled = image.copy()
                    scaled.thumbnail((limit, limit), Image.Resampling.LANCZOS)
                    output = io.BytesIO()
                    options = {'quality': 90} if image_format in ('JPEG', 'WEBP') else {}
                    scaled.save(output, format=image_format, **options)
                    if output.tell() <= rules['max_file_bytes']:
                        result = {
                            'width': scaled.width, 'height': scaled.height,
                            'resized': True, 'replacement': base64.b64encode(output.getvalue()).decode('ascii')
                        }
                        break
                    limit = int(limit * 0.8)
                else:
                    raise ValueError('The resized figure still exceeds the upload limit')
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

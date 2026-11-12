"""Decode an exported QR PNG and assert its exact destination."""
import sys
from PIL import Image
import zxingcpp
image = Image.open(sys.argv[1])
result = zxingcpp.read_barcode(image)
assert result is not None, 'QR could not be decoded'
assert result.text == sys.argv[2], f'Wrong QR destination: {result.text}'
print('Decoded QR destination:', result.text)

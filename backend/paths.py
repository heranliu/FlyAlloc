"""Local, frozen research replay assets; importing this module never downloads data."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SYMBOLS = [row['symbol'] for row in json.loads((ROOT / 'config/basket.json').read_text())['basket']]

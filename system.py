import functools
import os
import sys
import json
from concurrent.futures import ThreadPoolExecutor
import glob
from ttkbootstrap import Style
from PIL import Image, ImageTk

# Initialize a thread pool executor for potential concurrency
executor = ThreadPoolExecutor(max_workers=os.cpu_count())

# Enable memoization with functools
@functools.lru_cache(maxsize=None)
def load_cached_json(file_path):
    with open(file_path, 'r') as file:
        return json.load(file)

@functools.lru_cache(maxsize=None)
def load_cached_image(file_path):
    return Image.open(file_path)

# Optimize file loading by preloading data
def preload_files():
    json_files = glob.glob(os.path.join('json', '*.json'))
    image_files = glob.glob(os.path.join('images', '*.*'))
    
    json_futures = [executor.submit(load_cached_json, file_name) for file_name in json_files]
    image_futures = [executor.submit(load_cached_image, file_name) for file_name in image_files]
    
    return json_futures + image_futures

# Load theme settings from a JSON file
@functools.lru_cache(maxsize=1)
def load_theme_settings():
    theme_file = 'theme_settings.json'
    return load_cached_json(theme_file) if os.path.exists(theme_file) else {"theme": "darkly"}

def apply_theme(root, theme_name):
    return Style(theme=theme_name)

def initialize_system(root, log_file_path, theme_name):
    if sys.platform == 'win32':
        import psutil
        psutil.Process(os.getpid()).nice(psutil.HIGH_PRIORITY_CLASS)
    elif sys.platform == 'linux':
        os.nice(-10)
    
    # Preload files in the background
    executor.submit(preload_files)
    
    return apply_theme(root, theme_name)

# Helper function to get preloaded image
def get_preloaded_image(file_path):
    return load_cached_image(file_path)

# Helper function to get preloaded JSON
def get_preloaded_json(file_path):
    return load_cached_json(file_path)
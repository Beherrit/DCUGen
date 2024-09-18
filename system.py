import functools
import os
import sys
import json
from concurrent.futures import ThreadPoolExecutor
import glob
from ttkbootstrap import Style
from PIL import Image, ImageTk
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

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

class FileChangeHandler(FileSystemEventHandler):
    def __init__(self, callback):
        self.callback = callback

    def on_any_event(self, event):
        if not event.is_directory:
            self.callback()

def watch_for_changes(directories, callback):
    event_handler = FileChangeHandler(callback)
    observer = Observer()
    for directory in directories:
        observer.schedule(event_handler, directory, recursive=True)
    observer.start()
    return observer

def create_file_watcher(root, directories_to_watch):
    def refresh_display():
        if root.winfo_exists():
            root.event_generate("<<RefreshDisplay>>")

    observer = watch_for_changes(directories_to_watch, refresh_display)
    return observer

# Helper function to get preloaded image
def get_preloaded_image(file_path):
    return load_cached_image(file_path)

# Helper function to get preloaded JSON
def get_preloaded_json(file_path):
    return load_cached_json(file_path)

def stop_file_watcher(observer):
    observer.stop()
    observer.join()

def initialize_system(root, log_file_path, theme_name):
    if sys.platform == 'win32':
        import psutil
        psutil.Process(os.getpid()).nice(psutil.HIGH_PRIORITY_CLASS)
    elif sys.platform == 'linux':
        os.nice(-10)
    
    # Preload files in the background
    executor.submit(preload_files)
    
    # Create file watcher
    directories_to_watch = ['json', 'images']  # Add any other directories you want to watch
    file_watcher = create_file_watcher(root, directories_to_watch)
    
    # Ensure the file watcher is stopped when the root window is destroyed
    root.protocol("WM_DELETE_WINDOW", lambda: (stop_file_watcher(file_watcher), root.destroy()))
    
    return apply_theme(root, theme_name), file_watcher
import functools
import logging
import json
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
import glob
import ttkbootstrap as ttk
from ttkbootstrap import Style

# Initialize a thread pool executor for potential concurrency
executor = ThreadPoolExecutor(max_workers=os.cpu_count())

# Enable memoization with functools
@functools.lru_cache(maxsize=None)
def load_cached_json(file_path):
    with open(file_path, 'r') as file:
        return json.load(file)

# Define a simple function to offload heavy tasks to a thread
def run_in_thread(func, *args, **kwargs):
    future = executor.submit(func, *args, **kwargs)
    return future

# Example function to offload expensive calculations to a separate thread
def calculate_in_thread(func, *args):
    return run_in_thread(func, *args)

# If applicable, enable system-level optimizations such as higher priority for CPU usage
def boost_system_performance():
    if sys.platform == 'win32':
        import psutil
        p = psutil.Process(os.getpid())
        p.nice(psutil.HIGH_PRIORITY_CLASS)
    elif sys.platform == 'linux':
        os.nice(-10)  # Increase process priority on Linux

# Optimize file loading by preloading data
def preload_files():
    preload_tasks = []
    json_folder_path = 'json/'  # Path to the json folder
    json_files = glob.glob(os.path.join(json_folder_path, '*.json'))  # Get all .json files in the folder

    for file_name in json_files:
        preload_tasks.append(run_in_thread(load_cached_json, file_name))

    return preload_tasks

# Load theme settings from a JSON file
def load_theme_settings():
    theme_file = 'theme_settings.json'
    if os.path.exists(theme_file):
        with open(theme_file, 'r') as file:
            return json.load(file)
    return {"theme": "darkly"}  # Default theme

def apply_theme(root, theme_name):
    style = Style(theme=theme_name)
    return style

# Modify this function to accept a theme parameter
def initialize_system(root, log_file_path, theme_name):
    boost_system_performance()
    preload_files()
    style = apply_theme(root, theme_name)
    return style
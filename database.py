import os
import random
import math
import pandas as pd
import xlsxwriter
import tkinter as tk
from tkinter import messagebox, filedialog, ttk, StringVar
from openpyxl import load_workbook
import sqlite3
import json
import openpyxl
from openpyxl.styles import Font

dark_mode_colors = {
    'background': '#2E2E2E',
    'foreground': '#FFFFFF',
    'button_background': '#333333',
    'button_foreground': '#FFFFFF',
    'text_background': '#333333',
    'text_foreground': '#FFFFFF',
    'highlight': '#5C5C5C'
}

light_mode_colors = {
    'background': '#F0F0F0',
    'foreground': '#000000',
    'button_background': '#E0E0E0',
    'button_foreground': '#000000',
    'text_background': '#FFFFFF',
    'text_foreground': '#000000'
}

def load_data_from_json(file_name):
    with open(file_name, 'r', encoding='utf-8') as file:
        data = json.load(file)
    return data

def load_archetypes():
    with open('./json/archetypes.json', 'r', encoding='utf-8') as file:
        return json.load(file)

def highlight_text(text_widget, search_query, dark_mode):
    search_query = search_query.lower()
    text_widget.tag_remove('highlight', '1.0', tk.END)
    if search_query:
        start_index = '1.0'
        while True:
            start_index = text_widget.search(search_query, start_index, tk.END, nocase=True)
            if not start_index:
                break
            end_index = f"{start_index}+{len(search_query)}c"
            text_widget.tag_add('highlight', start_index, end_index)
            start_index = end_index
        highlight_color = dark_mode_colors['highlight'] if dark_mode else 'yellow'
        text_widget.tag_configure('highlight', background=highlight_color)

def on_search_change(search_var, notebook, text_widgets, dark_mode):
    search_query = search_var.get()
    selected_tab = notebook.nametowidget(notebook.select())
    text_widget = text_widgets.get(selected_tab)
    if text_widget:
        highlight_text(text_widget, search_query, dark_mode)

def create_table_if_not_exists():
    with sqlite3.connect('tabs_data.db') as conn:
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS tabs (content TEXT, character TEXT)''')
        conn.commit()

def save_tabs(notebook, text_widgets, characters):
    with sqlite3.connect('tabs_data.db') as conn:
        c = conn.cursor()
        c.execute('DELETE FROM tabs')  # Clear existing data
        for tab in notebook.tabs():
            tab_name = notebook.tab(tab, "text")
            text_widget = text_widgets.get(tab)
            character = characters.get(tab_name)
            if text_widget:
                tab_content = text_widget.get("1.0", tk.END)
                tab_character = json.dumps(character) if character else None
                c.execute('INSERT INTO tabs VALUES (?, ?)', (tab_content, tab_character))
        conn.commit()


def load_tabs(notebook, text_widgets, characters):
    with sqlite3.connect('tabs_data.db') as conn:
        c = conn.cursor()
        try:
            c.execute('SELECT content, character FROM tabs')
            tabs_data = c.fetchall()
            for tab_content, tab_character in tabs_data:
                tab_name, tab_widget = create_new_tab(notebook, text_widgets, tab_content)
                if tab_character:
                    characters[tab_name] = json.loads(tab_character)
        except sqlite3.OperationalError:
            c.execute('SELECT content FROM tabs')
            tabs_data = c.fetchall()
            for tab_content, in tabs_data:
                tab_name, tab_widget = create_new_tab(notebook, text_widgets, tab_content)

def create_new_tab(notebook, text_widgets, content=""):
    new_tab = ttk.Frame(notebook)
    tab_name = f"Tab {len(notebook.tabs()) + 1}"
    notebook.add(new_tab, text=tab_name)
    new_character_summary_text = tk.Text(new_tab, height=15, width=50)
    new_character_summary_text.pack(expand=True, fill='both')
    new_character_summary_text.insert("1.0", content)
    text_widgets[new_tab] = new_character_summary_text
    notebook.select(new_tab)
    new_character_summary_text.tag_configure('highlight', background='yellow')
    return tab_name, new_tab

def close_current_tab(notebook, text_widgets):
    # Get the currently selected tab widget
    current_tab = notebook.nametowidget(notebook.select())

    # Check if there is at least one tab open
    if notebook.tabs():
        # Close the selected tab
        notebook.forget(current_tab)
        # Remove the associated text widget from the dictionary
        text_widgets.pop(current_tab, None)


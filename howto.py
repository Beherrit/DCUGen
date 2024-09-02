import tkinter as tk
from tkinter import ttk
from tooltip import ToolTip
import ttkbootstrap as ttk
from ttkbootstrap.constants import *

class HowToApp:
    def __init__(self, master):
        self.master = master
        self.master.title("Guides / How To")

        # Use the current theme
        self.style = ttk.Style()

        self.main_frame = ttk.Frame(self.master)
        self.main_frame.pack(fill='both', expand=True)

        self.create_sections()

    def create_sections(self):
        sections = [
            ("Character Creator", self.character_creator_guide),
            ("GM Tools", self.gm_tools_guide),
            ("Settings", self.settings_guide)
        ]

        for title, command in sections:
            button = ttk.Button(self.main_frame, text=title, command=command, style='primary.TButton')
            button.pack(side='top', padx=5, pady=5, fill='x')
            ToolTip(button, f"Learn about the {title} features")

    def character_creator_guide(self):
        content = """
        Character Creator Guide:
        1. Generate Character: Opens a window to set filters and generate a character with customizable options.
        2. Export Character Sheet: Exports the generated character data to a formatted character sheet.
        3. Close Tab: Closes the current character tab in the notebook.
        4. Close All Tabs: Closes all open character tabs in the notebook.
        5. Copy AI Prompt: Copies the AI-friendly character description to the clipboard for use with AI tools.
        """
        self.show_guide("Character Creator Guide", content)

    def gm_tools_guide(self):
        content = """
        GM Tools Guide:
        1. Generate Equipment: Creates random equipment based on specified equipment points.
        2. Generate Vehicle: Generates a random vehicle using vehicle points.
        3. Generate Encounter: Creates a random encounter based on selected difficulty levels.
        4. Initiative Tracker: Manages combat turns and tracks character conditions.
        5. Dice Roller: Simulates various dice rolls for game mechanics.
        6. Complications: Generates random complications for added story depth.
        7. GM Cheat Sheet: Quick reference for character stats and important information.
        8. Calculate Powers: Assists in calculating power effects and modifiers.
        9. Reference Data: Provides quick access to game rules and reference information.
        10. Notes: Allows GMs to create and manage campaign notes.
        """
        self.show_guide("GM Tools Guide", content)

    def settings_guide(self):
        content = """
        Settings Guide:
        1. Open Settings: Customize application preferences, including theme and default values.
        2. Guides / How To: Access this comprehensive guide for using the application.
        """
        self.show_guide("Settings Guide", content)

    def show_guide(self, title, content):
        guide_window = ttk.Toplevel(self.master)
        guide_window.title(title)
        
        frame = ttk.Frame(guide_window, padding="10")
        frame.pack(fill='both', expand=True)

        text = ttk.Text(frame, wrap='word', width=60, height=20)
        text.pack(side='left', fill='both', expand=True)
        
        scrollbar = ttk.Scrollbar(frame, orient='vertical', command=text.yview)
        scrollbar.pack(side='right', fill='y')
        
        text['yscrollcommand'] = scrollbar.set
        
        text.insert('1.0', content)
        text.config(state='disabled')

if __name__ == "__main__":
    root = ttk.Window(themename="darkly")
    app = HowToApp(root)
    root.mainloop()
import tkinter as tk
from tkinter import ttk, messagebox
from DCUQA import pretty_print_character, calculate_totals, update_defense
from utils import load_data_from_json, generate_character_description
import random
import importlib
import os
import tkinter as tk
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from tkinter import scrolledtext

class SettingsChangeHandler(FileSystemEventHandler):
    def __init__(self, callback):
        self.callback = callback

    def on_modified(self, event):
        if event.src_path.endswith('settings.py'):
            self.callback()

class CharacterPreviewScreen:
    def __init__(self, parent, character_creator):
        self.parent = parent
        self.character_creator = character_creator
        self.create_widgets()

    def create_widgets(self):
        self.preview_text = scrolledtext.ScrolledText(self.parent, wrap=tk.WORD, width=60, height=30)
        self.preview_text.pack(expand=True, fill='both', padx=10, pady=10)
        self.update_preview()

    def update_preview(self):
        self.preview_text.delete('1.0', tk.END)
        character = self.character_creator.get_current_character()
        pretty_print_character(character, self.preview_text)
        self.parent.after(1000, self.update_preview)  # Update every second

class CustomCharacterCreator:
    def __init__(self, master, notebook, text_widgets, characters, dark_mode):
        self.master = master
        self.notebook = notebook
        self.text_widgets = text_widgets
        self.characters = characters
        self.dark_mode = dark_mode
        
        self.window = tk.Toplevel(master)
        self.window.title("Create Custom Character")
        self.window.geometry("800x600")
        
        self.character = {
            "name": "", "gender": "", "age": "", "theme": "",
            "origin": {"region": "", "country": "", "language": ""},
            "physical_traits": {"height": "", "weight": "", "eye_color": "", "hair_color": "", "skin_tone": ""},
            "stats": {}, "defenses": {}, "skills": [], "advantages": [], "powers": [],
            "equipment": [], "personality_traits": {"positive_traits": [], "negative_traits": [], "quirky_traits": []},
            "languages": [], "Motivation": {}, "Complications": []
        }
        
        # Load data from JSON files
        self.stats_data = load_data_from_json('json/stats.json')
        self.skills_data = load_data_from_json('json/skills.json')
        self.advantages_data = load_data_from_json('json/advantages.json')
        self.powers_data = load_data_from_json('json/powers.json')
        self.expanded_traits_data = load_data_from_json('json/expanded_traits.json')
        self.character_origins = load_data_from_json('json/characterOrigins.json')
        self.languages = load_data_from_json('json/languages.json')
        self.physical_traits = load_data_from_json('json/physical_traits.json')
        self.themes = load_data_from_json('json/theme.json')
        self.extras_data = load_data_from_json('json/extras.json')
        self.flaws_data = load_data_from_json('json/flaws.json')
        
        self.expanded_traits = load_data_from_json('json/expanded_traits.json')
        self.personality_traits = load_data_from_json('json/PersonalityTraits.json')
        self.motivations = load_data_from_json('json/motivations.json')
        self.complications = load_data_from_json('json/complications.json')
        
        self.occupations = load_data_from_json('json/occupations.json')
        self.physical_traits = load_data_from_json('json/physical_traits.json')
        
        self.modifier_vars = {}
        self.modifier_lists = {}
        
        self.advantages_tree = None  # Initialize it as None
        self.create_widgets()
        
        # Set up watchdog
        self.observer = Observer()
        event_handler = SettingsChangeHandler(self.reload_settings)
        self.observer.schedule(event_handler, path=os.path.dirname(os.path.abspath(__file__)), recursive=False)
        self.observer.start()

        self.window.protocol("WM_DELETE_WINDOW", self.on_closing)

    def on_closing(self):
        self.observer.stop()
        self.observer.join()
        self.window.destroy()

    def reload_settings(self):
        importlib.reload(importlib.import_module('settings'))
        self.load_data()
        self.update_ui()

    def load_data(self):
        # Reload all data from JSON files
        self.stats_data = load_data_from_json('json/stats.json')
        self.skills_data = load_data_from_json('json/skills.json')
        self.advantages_data = load_data_from_json('json/advantages.json')
        self.powers_data = load_data_from_json('json/powers.json')
        self.expanded_traits_data = load_data_from_json('json/expanded_traits.json')
        self.character_origins = load_data_from_json('json/characterOrigins.json')
        self.languages = load_data_from_json('json/languages.json')
        self.physical_traits = load_data_from_json('json/physical_traits.json')
        self.themes = load_data_from_json('json/theme.json')
        self.extras_data = load_data_from_json('json/extras.json')
        self.flaws_data = load_data_from_json('json/flaws.json')
        self.expanded_traits = load_data_from_json('json/expanded_traits.json')
        self.personality_traits = load_data_from_json('json/PersonalityTraits.json')
        self.motivations = load_data_from_json('json/motivations.json')
        self.complications = load_data_from_json('json/complications.json')

    def update_ui(self):
        # Update all UI elements based on the new data
        self.update_stats_ui()
        self.update_skills_ui()
        self.update_advantages_ui()
        self.update_powers_ui()
        self.update_traits_ui()
        self.update_origins_ui()
        self.update_languages_ui()
        self.update_physical_traits_ui()
        self.update_themes_ui()
        self.update_extras_ui()
        self.update_flaws_ui()
        self.update_motivations_ui()
        self.update_complications_ui()

    def create_widgets(self):
        notebook = ttk.Notebook(self.window)
        notebook.pack(expand=True, fill='both')
        
        # Basic Info Tab
        basic_frame = ttk.Frame(notebook)
        notebook.add(basic_frame, text="Basic Info")
        self.create_basic_info_widgets(basic_frame)
        
        # Stats and Defenses Tab
        stats_frame = ttk.Frame(notebook)
        notebook.add(stats_frame, text="Stats & Defenses")
        self.create_stats_widgets(stats_frame)
        
        # Skills and Advantages Tab
        skills_frame = ttk.Frame(notebook)
        notebook.add(skills_frame, text="Skills & Advantages")
        self.create_skills_advantages_widgets(skills_frame)
        
        # Powers Tab
        powers_frame = ttk.Frame(notebook)
        notebook.add(powers_frame, text="Powers")
        self.create_powers_widgets(powers_frame)
        
        # Personality and Background Tab
        personality_frame = ttk.Frame(notebook)
        notebook.add(personality_frame, text="Personality & Background")
        self.create_personality_widgets(personality_frame)
        
        # Character Preview Screen
        preview_frame = ttk.Frame(notebook)
        notebook.add(preview_frame, text="Character Preview")
        self.preview_screen = CharacterPreviewScreen(preview_frame, self)

        # TODO: Implement bind_update_events() method if needed
        # self.bind_update_events()

        # Create Character Button
        create_button = ttk.Button(self.window, text="Create Character", command=self.create_character)
        create_button.pack(pady=10)
    
    def create_basic_info_widgets(self, parent):
        ttk.Label(parent, text="Power Level:").grid(row=0, column=0, padx=5, pady=5, sticky='e')
        self.pl_var = tk.StringVar(value="10")
        self.pl_spinbox = ttk.Spinbox(parent, from_=1, to=20, textvariable=self.pl_var, width=5)
        self.pl_spinbox.grid(row=0, column=1, padx=5, pady=5, sticky='w')

        fields = ["Name", "Gender", "Age"]
        for i, field in enumerate(fields):
            ttk.Label(parent, text=f"{field}:").grid(row=i+1, column=0, padx=5, pady=5, sticky='e')
            entry = ttk.Entry(parent)
            entry.grid(row=i+1, column=1, padx=5, pady=5, sticky='w')
            setattr(self, f"{field.lower()}_entry", entry)

        # Theme dropdown
        ttk.Label(parent, text="Theme:").grid(row=len(fields)+1, column=0, padx=5, pady=5, sticky='e')
        self.theme_var = tk.StringVar()
        self.theme_combobox = ttk.Combobox(parent, textvariable=self.theme_var, state="readonly")
        self.theme_combobox['values'] = self.themes['theme']
        self.theme_combobox.grid(row=len(fields)+1, column=1, padx=5, pady=5, sticky='w')

        # Region dropdown
        ttk.Label(parent, text="Region:").grid(row=len(fields)+2, column=0, padx=5, pady=5, sticky='e')
        self.region_var = tk.StringVar()
        self.region_combobox = ttk.Combobox(parent, textvariable=self.region_var, state="readonly")
        self.region_combobox['values'] = [region['region'] for region in self.character_origins]
        self.region_combobox.grid(row=len(fields)+2, column=1, padx=5, pady=5, sticky='w')
        self.region_combobox.bind('<<ComboboxSelected>>', self.update_country_options)

        # Country dropdown
        ttk.Label(parent, text="Country:").grid(row=len(fields)+3, column=0, padx=5, pady=5, sticky='e')
        self.country_var = tk.StringVar()
        self.country_combobox = ttk.Combobox(parent, textvariable=self.country_var, state="readonly")
        self.country_combobox.grid(row=len(fields)+3, column=1, padx=5, pady=5, sticky='w')
        self.country_combobox.bind('<<ComboboxSelected>>', self.update_language_options)

        # Language dropdown
        ttk.Label(parent, text="Language:").grid(row=len(fields)+4, column=0, padx=5, pady=5, sticky='e')
        self.language_var = tk.StringVar()
        self.language_combobox = ttk.Combobox(parent, textvariable=self.language_var, state="readonly")
        self.language_combobox.grid(row=len(fields)+4, column=1, padx=5, pady=5, sticky='w')

        # Physical traits
        physical_traits = ["Height", "Eye Color", "Hair Color", "Skin Tone"]
        for i, trait in enumerate(physical_traits):
            ttk.Label(parent, text=f"{trait}:").grid(row=i+len(fields)+5, column=0, padx=5, pady=5, sticky='e')
            var = tk.StringVar()
            combobox = ttk.Combobox(parent, textvariable=var, state="readonly")
            combobox['values'] = self.physical_traits['PHYSICAL_TRAITS'][trait.upper().replace(' ', '_')]
            combobox.grid(row=i+len(fields)+5, column=1, padx=5, pady=5, sticky='w')
            setattr(self, f"{trait.lower().replace(' ', '_')}_var", var)

        # Weight (as it's numeric, we'll keep it as an Entry)
        ttk.Label(parent, text="Weight:").grid(row=len(fields)+9, column=0, padx=5, pady=5, sticky='e')
        self.weight_entry = ttk.Entry(parent)
        self.weight_entry.grid(row=len(fields)+9, column=1, padx=5, pady=5, sticky='w')

        # Occupation dropdown
        ttk.Label(parent, text="Occupation:").grid(row=len(fields)+10, column=0, padx=5, pady=5, sticky='e')
        self.occupation_var = tk.StringVar()
        self.occupation_combobox = ttk.Combobox(parent, textvariable=self.occupation_var, state="readonly")
        self.occupation_combobox['values'] = self.get_all_occupations()
        self.occupation_combobox.grid(row=len(fields)+10, column=1, padx=5, pady=5, sticky='w')

        # Costume Style dropdown
        ttk.Label(parent, text="Costume Style:").grid(row=len(fields)+11, column=0, padx=5, pady=5, sticky='e')
        self.costume_style_var = tk.StringVar()
        self.costume_style_combobox = ttk.Combobox(parent, textvariable=self.costume_style_var, state="readonly")
        self.costume_style_combobox['values'] = self.physical_traits['COSTUME_STYLES']
        self.costume_style_combobox.grid(row=len(fields)+11, column=1, padx=5, pady=5, sticky='w')

        # Distinctive Feature dropdown
        ttk.Label(parent, text="Distinctive Feature:").grid(row=len(fields)+12, column=0, padx=5, pady=5, sticky='e')
        self.distinctive_feature_var = tk.StringVar()
        self.distinctive_feature_combobox = ttk.Combobox(parent, textvariable=self.distinctive_feature_var, state="readonly")
        self.distinctive_feature_combobox['values'] = self.physical_traits['DISTINCTIVE_FEATURES']
        self.distinctive_feature_combobox.grid(row=len(fields)+12, column=1, padx=5, pady=5, sticky='w')

    def get_all_occupations(self):
        all_occupations = []
        for category in self.occupations.values():
            all_occupations.extend(category)
        return sorted(list(set(all_occupations)))  # Remove duplicates and sort

    def update_country_options(self, event):
        selected_region = self.region_var.get()
        for region in self.character_origins:
            if region['region'] == selected_region:
                if 'countries' in region:
                    self.country_combobox['values'] = [country['name'] for country in region['countries']]
                else:
                    self.country_combobox['values'] = [region['region']]  # For regions without specific countries
                break
        self.country_combobox.set('')  # Clear the current selection
        self.language_combobox.set('')  # Clear the language selection

    def update_language_options(self, event):
        selected_region = self.region_var.get()
        selected_country = self.country_var.get()
        for region in self.character_origins:
            if region['region'] == selected_region:
                if 'countries' in region:
                    for country in region['countries']:
                        if country['name'] == selected_country:
                            self.language_combobox['values'] = country['languages']
                            break
                else:
                    self.language_combobox['values'] = region['languages']
                break
        self.language_combobox.set('')  # Clear the current selection

    def create_stats_widgets(self, parent):
        self.stat_vars = {}
        for i, stat in enumerate(self.stats_data['STATS']):
            ttk.Label(parent, text=f"{stat['name']}:").grid(row=i, column=0, padx=5, pady=5, sticky='e')
            var = tk.StringVar(value="0")
            self.stat_vars[stat['name']] = var
            spinbox = ttk.Spinbox(parent, from_=-5, to=20, textvariable=var, width=5)
            spinbox.grid(row=i, column=1, padx=5, pady=5, sticky='w')
            spinbox.config(command=lambda s=stat['name']: self.on_stat_change(s))
            
            # Bind the Enter and Tab keys to update_skill_stats
            spinbox.bind('<Return>', lambda event, s=stat['name']: self.on_stat_change(s))
            spinbox.bind('<Tab>', lambda event, s=stat['name']: self.on_stat_change(s))
        
        self.defense_vars = {}
        defenses = ["Dodge", "Fortitude", "Parry", "Toughness", "Will"]
        for i, defense in enumerate(defenses):
            ttk.Label(parent, text=f"{defense}:").grid(row=i, column=2, padx=5, pady=5, sticky='e')
            var = tk.StringVar(value="0")
            self.defense_vars[defense] = var
            spinbox = ttk.Spinbox(parent, from_=0, to=30, textvariable=var, width=5)
            spinbox.grid(row=i, column=3, padx=5, pady=5, sticky='w')

        # Initiative
        ttk.Label(parent, text="Initiative:").grid(row=len(defenses), column=2, padx=5, pady=5, sticky='e')
        self.initiative_var = tk.StringVar(value="0")
        self.initiative_label = ttk.Label(parent, textvariable=self.initiative_var)
        self.initiative_label.grid(row=len(defenses), column=3, padx=5, pady=5, sticky='w')

        # Bind the Agility stat to update initiative
        self.stat_vars['Agility'].trace('w', self.update_initiative)

    def bind_improved_initiative(self):
        if self.advantages_tree:
            for item in self.advantages_tree.get_children():
                if self.advantages_tree.item(item)['values'][0] == 'Improved Initiative':
                    self.advantages_tree.tag_bind(item, '<<TreeviewSelect>>', self.update_initiative)

    def update_initiative(self, *args):
        agility_value = self.stat_vars['Agility'].get()
        agility = int(agility_value) if agility_value.strip() else 0
        improved_initiative = 0
        if self.advantages_tree:
            for item in self.advantages_tree.get_children():
                if self.advantages_tree.item(item)['values'][0] == 'Improved Initiative':
                    improved_initiative_value = self.advantages_tree.item(item)['values'][1]
                    if isinstance(improved_initiative_value, str):
                        improved_initiative = int(improved_initiative_value) if improved_initiative_value.strip() else 0
                    elif isinstance(improved_initiative_value, int):
                        improved_initiative = improved_initiative_value
                    else:
                        improved_initiative = 0
        
        initiative = agility + (improved_initiative * 4)
        self.initiative_var.set(str(initiative))

    def on_stat_change(self, stat_name):
        print(f"Stat changed: {stat_name}, New value: {self.stat_vars[stat_name].get()}")
        self.update_skill_stats()

    def on_stat_change(self, stat_name):
        self.update_skill_stats()

    def update_skill_stats(self):
        for item in self.skills_tree.get_children():
            values = self.skills_tree.item(item, 'values')
            skill_name, rank, _, _, stat_name = values
            stat_value = int(self.stat_vars[stat_name].get())
            total = int(rank) + stat_value
            self.skills_tree.item(item, values=(skill_name, rank, stat_value, total, stat_name))

    def create_skills_advantages_widgets(self, parent):
        # Skills
        skills_frame = ttk.Frame(parent)
        skills_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        self.skills_tree = ttk.Treeview(skills_frame, columns=('Skill', 'Rank', 'Stat', 'Total'), show='headings')
        self.skills_tree.heading('Skill', text='Skill')
        self.skills_tree.heading('Rank', text='Rank')
        self.skills_tree.heading('Stat', text='Stat')
        self.skills_tree.heading('Total', text='Total')
        self.skills_tree.column('Skill', width=150)
        self.skills_tree.column('Rank', width=50)
        self.skills_tree.column('Stat', width=50)
        self.skills_tree.column('Total', width=50)
        self.skills_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        skills_scrollbar = ttk.Scrollbar(skills_frame, orient=tk.VERTICAL, command=self.skills_tree.yview)
        skills_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.skills_tree.configure(yscrollcommand=skills_scrollbar.set)

        for skill in self.skills_data:
            stat_name = skill['tags'][0]  # Use the first tag as the associated stat
            stat_value = int(self.stat_vars[stat_name].get())
            self.skills_tree.insert('', 'end', values=(skill['name'], 0, stat_value, stat_value, stat_name))

        skill_buttons_frame = ttk.Frame(skills_frame)
        skill_buttons_frame.pack(fill=tk.X, padx=5, pady=5)
        ttk.Button(skill_buttons_frame, text="Increase Skill Rank", command=self.increase_skill_rank).pack(side=tk.LEFT, padx=5)
        ttk.Button(skill_buttons_frame, text="Decrease Skill Rank", command=self.decrease_skill_rank).pack(side=tk.LEFT, padx=5)

        # Advantages
        advantages_frame = ttk.Frame(parent)
        advantages_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        self.advantages_tree = ttk.Treeview(advantages_frame, columns=('Advantage', 'Rank'), show='headings')
        self.advantages_tree.heading('Advantage', text='Advantage')
        self.advantages_tree.heading('Rank', text='Rank')
        self.advantages_tree.column('Advantage', width=200)
        self.advantages_tree.column('Rank', width=50)
        self.advantages_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        advantages_scrollbar = ttk.Scrollbar(advantages_frame, orient=tk.VERTICAL, command=self.advantages_tree.yview)
        advantages_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.advantages_tree.configure(yscrollcommand=advantages_scrollbar.set)

        for advantage in self.advantages_data:
            self.advantages_tree.insert('', 'end', values=(advantage['name'], 0))

        advantage_buttons_frame = ttk.Frame(advantages_frame)
        advantage_buttons_frame.pack(fill=tk.X, padx=5, pady=5)
        ttk.Button(advantage_buttons_frame, text="Increase Advantage Rank", command=self.increase_advantage_rank).pack(side=tk.LEFT, padx=5)
        ttk.Button(advantage_buttons_frame, text="Decrease Advantage Rank", command=self.decrease_advantage_rank).pack(side=tk.LEFT, padx=5)

        # Add a description label
        self.advantage_description_label = ttk.Label(advantages_frame, text="", wraplength=300)
        self.advantage_description_label.pack(fill=tk.X, padx=5, pady=5)

        # Bind the selection event to update the description
        self.advantages_tree.bind('<<TreeviewSelect>>', self.update_advantage_description)

        # Now that advantages_tree is created, we can bind Improved Initiative
        self.bind_improved_initiative()

    def update_advantage_description(self, event):
        selected_items = self.advantages_tree.selection()
        if selected_items:
            item = selected_items[0]
            advantage_name = self.advantages_tree.item(item, 'values')[0]
            for advantage in self.advantages_data:
                if advantage['name'] == advantage_name:
                    description = advantage['description']
                    self.advantage_description_label.config(text=description)
                    break
        else:
            self.advantage_description_label.config(text="")

    def increase_skill_rank(self):
        selected_item = self.skills_tree.selection()
        if selected_item:
            item = selected_item[0]
            values = self.skills_tree.item(item, 'values')
            skill_name, rank, stat_value, _, stat_name = values
            new_rank = int(rank) + 1
            new_total = int(stat_value) + new_rank
            self.skills_tree.item(item, values=(skill_name, new_rank, stat_value, new_total, stat_name))

    def decrease_skill_rank(self):
        selected_item = self.skills_tree.selection()
        if selected_item:
            item = selected_item[0]
            values = self.skills_tree.item(item, 'values')
            skill_name, rank, stat_value, _, stat_name = values
            new_rank = max(0, int(rank) - 1)
            new_total = int(stat_value) + new_rank
            self.skills_tree.item(item, values=(skill_name, new_rank, stat_value, new_total, stat_name))

    def increase_advantage_rank(self):
        selected_item = self.advantages_tree.selection()
        if selected_item:
            item = selected_item[0]
            values = self.advantages_tree.item(item, 'values')
            advantage_name, rank = values
            new_rank = int(rank) + 1
            self.advantages_tree.item(item, values=(advantage_name, new_rank))

    def decrease_advantage_rank(self):
        selected_item = self.advantages_tree.selection()
        if selected_item:
            item = selected_item[0]
            values = self.advantages_tree.item(item, 'values')
            advantage_name, rank = values
            new_rank = max(0, int(rank) - 1)
            self.advantages_tree.item(item, values=(advantage_name, new_rank))

    def update_skill_stats(self):
        for item in self.skills_tree.get_children():
            values = self.skills_tree.item(item, 'values')
            skill_name, rank, _, _, stat_name = values
            stat_value = int(self.stat_vars[stat_name].get())
            total = int(rank) + stat_value
            self.skills_tree.item(item, values=(skill_name, rank, stat_value, total, stat_name))

    def create_powers_widgets(self, parent):
        powers_frame = ttk.Frame(parent)
        powers_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # Left column
        left_frame = ttk.Frame(powers_frame)
        left_frame.grid(row=0, column=0, sticky='nsew', padx=5, pady=5)

        # Power selection
        ttk.Label(left_frame, text="Power:").grid(row=0, column=0, sticky='e', padx=5, pady=5)
        self.power_var = tk.StringVar()
        self.power_combobox = ttk.Combobox(left_frame, textvariable=self.power_var, state="readonly")
        self.power_combobox['values'] = [power['name'] for power in self.powers_data]
        self.power_combobox.grid(row=0, column=1, sticky='w', padx=5, pady=5)
        self.power_combobox.bind('<<ComboboxSelected>>', self.update_power_info)

        # Power type
        ttk.Label(left_frame, text="Power Type:").grid(row=1, column=0, sticky='e', padx=5, pady=5)
        self.power_type_var = tk.StringVar()
        self.power_type_combobox = ttk.Combobox(left_frame, textvariable=self.power_type_var, state="readonly")
        self.power_type_combobox['values'] = ['Combat', 'Movement', 'Utility', 'Support', 'Defensive']
        self.power_type_combobox.grid(row=1, column=1, sticky='w', padx=5, pady=5)

        # Power range (only visible for Combat powers)
        self.power_range_label = ttk.Label(left_frame, text="Power Range:")
        self.power_range_label.grid(row=2, column=0, sticky='e', padx=5, pady=5)
        self.power_range_var = tk.StringVar()
        self.power_range_combobox = ttk.Combobox(left_frame, textvariable=self.power_range_var, state="readonly")
        self.power_range_combobox['values'] = ['Melee', 'Ranged']
        self.power_range_combobox.grid(row=2, column=1, sticky='w', padx=5, pady=5)

        # Initially hide the range selection
        self.power_range_label.grid_remove()
        self.power_range_combobox.grid_remove()

        # Bind the power type selection to show/hide the range selection
        self.power_type_combobox.bind('<<ComboboxSelected>>', self.toggle_power_range)

        # Power info
        self.power_info_label = ttk.Label(left_frame, text="", wraplength=300)
        self.power_info_label.grid(row=3, column=0, columnspan=2, sticky='w', padx=5, pady=5)

        # Power Rank
        ttk.Label(left_frame, text="Power Rank:").grid(row=4, column=0, sticky='e', padx=5, pady=5)
        self.power_rank_var = tk.StringVar(value="1")
        self.power_rank_spinbox = ttk.Spinbox(left_frame, from_=1, to=20, textvariable=self.power_rank_var)
        self.power_rank_spinbox.grid(row=4, column=1, sticky='w', padx=5, pady=5)

        # Right column
        right_frame = ttk.Frame(powers_frame)
        right_frame.grid(row=0, column=1, sticky='nsew', padx=5, pady=5)

        # Extras, Flaws, and Flats
        self.create_modifier_section(right_frame, "Extras Per Rank", 0)
        self.create_modifier_section(right_frame, "Flaws Per Rank", 1)
        self.create_modifier_section(right_frame, "Extra Flats", 2)
        self.create_modifier_section(right_frame, "Flaw Flats", 3)

        # Bottom section
        bottom_frame = ttk.Frame(powers_frame)
        bottom_frame.grid(row=1, column=0, columnspan=2, sticky='nsew', padx=5, pady=5)

        # Add Power Button
        self.add_power_button = ttk.Button(bottom_frame, text="Add Power to Character", command=self.add_power_to_character)
        self.add_power_button.pack(pady=10)

        # Powers List
        self.powers_tree = ttk.Treeview(bottom_frame, columns=('Power', 'Rank', 'Extras', 'Flaws', 'Type', 'Range'), show='headings', height=5)
        self.powers_tree.heading('Power', text='Power')
        self.powers_tree.heading('Rank', text='Rank')
        self.powers_tree.heading('Extras', text='Extras')
        self.powers_tree.heading('Flaws', text='Flaws')
        self.powers_tree.heading('Type', text='Type')
        self.powers_tree.heading('Range', text='Range')
        self.powers_tree.column('Power', width=150)
        self.powers_tree.column('Rank', width=50)
        self.powers_tree.column('Extras', width=100)
        self.powers_tree.column('Flaws', width=100)
        self.powers_tree.column('Type', width=75)
        self.powers_tree.column('Range', width=75)
        self.powers_tree.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # Configure grid
        powers_frame.columnconfigure(0, weight=1)
        powers_frame.columnconfigure(1, weight=1)
        powers_frame.rowconfigure(1, weight=1)

    def toggle_power_range(self, event):
        if self.power_type_var.get() == 'Combat':
            self.power_range_label.grid()
            self.power_range_combobox.grid()
        else:
            self.power_range_label.grid_remove()
            self.power_range_combobox.grid_remove()

    def update_power_info(self, event):
        selected_power = self.power_var.get()
        for power in self.powers_data:
            if power['name'] == selected_power:
                info = f"Cost: {power['cost']} per rank, Max Rank: {power['max_rank']}, Type: {power['type']}"
                if 'range' in power:
                    info += f", Range: {power['range']}"
                if 'resisted' in power:
                    info += f", Resisted by: {power['resisted']}"
                self.power_info_label.config(text=info)
                
                # Set the power type
                self.power_type_var.set(power['type'])
                self.toggle_power_range(None)  # Update range visibility
                
                # Set the range if it's a combat power
                if power['type'] == 'Combat' and 'range' in power:
                    self.power_range_var.set(power['range'])
                break

    def add_power_to_character(self):
        selected_power = self.power_var.get()
        power_type = self.power_type_var.get()
        power_range = self.power_range_var.get() if power_type == 'Combat' else 'N/A'
        power_rank = self.power_rank_var.get()
        
        extras = list(self.modifier_lists["Extras Per Rank"].get(0, tk.END))
        flaws = list(self.modifier_lists["Flaws Per Rank"].get(0, tk.END))
        extra_flats = list(self.modifier_lists["Extra Flats"].get(0, tk.END))
        flaw_flats = list(self.modifier_lists["Flaw Flats"].get(0, tk.END))

        all_extras = extras + extra_flats
        all_flaws = flaws + flaw_flats

        self.powers_tree.insert('', 'end', values=(selected_power, power_rank, ', '.join(all_extras), ', '.join(all_flaws), power_type, power_range))

        # Clear selections
        self.power_combobox.set('')
        self.power_type_combobox.set('')
        self.power_range_combobox.set('')
        self.power_rank_var.set('1')
        for listbox in self.modifier_lists.values():
            listbox.delete(0, tk.END)

    def create_modifier_section(self, parent, title, row):
        frame = ttk.LabelFrame(parent, text=title)
        frame.grid(row=row, column=0, sticky='nsew', padx=5, pady=5)

        self.modifier_vars[title] = tk.StringVar()
        combobox = ttk.Combobox(frame, textvariable=self.modifier_vars[title], state="readonly")
        combobox['values'] = self.get_modifier_options(title)
        combobox.pack(side=tk.LEFT, padx=5, pady=5)

        add_button = ttk.Button(frame, text="Add", command=lambda: self.add_modifier(title))
        add_button.pack(side=tk.LEFT, padx=5, pady=5)

        self.modifier_lists[title] = tk.Listbox(frame, height=3)
        self.modifier_lists[title].pack(side=tk.LEFT, padx=5, pady=5, fill=tk.BOTH, expand=True)

    def get_modifier_options(self, modifier_type):
        if modifier_type == "Extras Per Rank":
            return [extra['name'] for extra in self.extras_data if extra['type'] == 'per_rank']
        elif modifier_type == "Flaws Per Rank":
            return [flaw['name'] for flaw in self.flaws_data if flaw['type'] == 'per_rank']
        elif modifier_type == "Extra Flats":
            return [extra['name'] for extra in self.extras_data if extra['type'] == 'flat_per_rank']
        elif modifier_type == "Flaw Flats":
            return [flaw['name'] for flaw in self.flaws_data if flaw['type'] == 'flat_per_rank']

    def add_modifier(self, modifier_type):
        selected = self.modifier_vars[modifier_type].get()
        if selected:
            self.modifier_lists[modifier_type].insert(tk.END, selected)
            self.modifier_vars[modifier_type].set('')  # Clear selection

    def get_current_character(self):
        # Collect all current character data
        character = {
            "name": self.name_entry.get(),
            "gender": self.gender_entry.get(),
            "age": self.age_entry.get(),
            "theme": self.theme_var.get(),
            "origin": {
                "region": self.region_var.get(),
                "country": self.country_var.get(),
                "language": self.language_var.get(),
            },
            "physical_traits": {
                "height": self.height_var.get(),
                "weight": self.weight_entry.get(),
                "eye_color": self.eye_color_var.get(),
                "hair_color": self.hair_color_var.get(),
                "skin_tone": self.skin_tone_var.get(),
            },
            "costume_style": self.costume_style_var.get(),
            "distinctive_feature": self.distinctive_feature_var.get(),
            "initiative": int(self.initiative_var.get()),
            "power_level": int(self.pl_var.get()),
            "languages": [self.language_var.get()],
            "occupation": self.occupation_var.get(),
            "stats": {},
            "defenses": {},
            "skills": [],
            "advantages": [],
            "powers": [],
            "personality_traits": {},
            "Motivation": {},
            "Complications": [],
            "expanded_traits": {},
        }

        # Stats and Defenses
        for stat_name, var in self.stat_vars.items():
            value = int(var.get())
            character["stats"][stat_name] = {"value": value, "cost": value * 2}
        
        # ... populate other sections (defenses, skills, advantages, powers, etc.) ...

        return character

    def create_character(self):
        # ... (rest of the code remains unchanged)

        # Add new fields to the character dictionary
        self.character["occupation"] = self.occupation_var.get()
        self.character["costume_style"] = self.costume_style_var.get()
        self.character["distinctive_feature"] = self.distinctive_feature_var.get()
        self.character["initiative"] = int(self.initiative_var.get())

        # Calculate totals
        attribute_total_cost, advantage_total_cost, skill_total_cost, power_total_cost, defense_total_cost, total_cost = calculate_totals(self.character)
        self.character['total_cost'] = total_cost
        
        # Display the character
        new_tab = ttk.Frame(self.notebook)
        self.notebook.add(new_tab, text=self.character["name"])
        new_character_summary_text = tk.Text(new_tab, height=15, width=50)
        new_character_summary_text.pack(expand=True, fill='both')
        pretty_print_character(self.character, new_character_summary_text)
        self.text_widgets[new_tab] = new_character_summary_text
        self.characters[self.character["name"]] = self.character
        self.notebook.select(new_tab)
        
        messagebox.showinfo("Character Created", f"Character '{self.character['name']}' has been created and added to the notebook.")
        self.window.destroy()

    def create_personality_widgets(self, parent):
        traits_frame = ttk.LabelFrame(parent, text="Personality Traits")
        traits_frame.pack(fill='x', padx=5, pady=5)

        for trait_type in ["positive_traits", "negative_traits", "quirky_traits"]:
            ttk.Label(traits_frame, text=f"{trait_type.replace('_', ' ').title()}:").pack(anchor='w')
            trait_var = tk.StringVar()
            trait_combobox = ttk.Combobox(traits_frame, textvariable=trait_var, values=self.personality_traits[trait_type])
            trait_combobox.pack(fill='x', padx=5, pady=2)
            setattr(self, f"{trait_type}_var", trait_var)

        motivation_frame = ttk.LabelFrame(parent, text="Motivation")
        motivation_frame.pack(fill='x', padx=5, pady=5)

        ttk.Label(motivation_frame, text="Motivation:").pack(anchor='w')
        self.motivation_var = tk.StringVar()
        motivation_combobox = ttk.Combobox(motivation_frame, textvariable=self.motivation_var, values=list(self.motivations["Hero"].keys()))
        motivation_combobox.pack(fill='x', padx=5, pady=2)

        complications_frame = ttk.LabelFrame(parent, text="Complications")
        complications_frame.pack(fill='x', padx=5, pady=5)

        ttk.Label(complications_frame, text="Complication:").pack(anchor='w')
        self.complication_var = tk.StringVar()
        complication_combobox = ttk.Combobox(complications_frame, textvariable=self.complication_var, values=list(self.complications.keys()))
        complication_combobox.pack(fill='x', padx=5, pady=2)

        # Bind events to update descriptions when selections change
        motivation_combobox.bind("<<ComboboxSelected>>", self.update_motivation_description)
        complication_combobox.bind("<<ComboboxSelected>>", self.update_complication_description)

        # Add description labels
        self.motivation_description = ttk.Label(motivation_frame, text="", wraplength=300)
        self.motivation_description.pack(fill='x', padx=5, pady=5)

        self.complication_description = ttk.Label(complications_frame, text="", wraplength=300)
        self.complication_description.pack(fill='x', padx=5, pady=5)

        # Add expanded traits
        expanded_traits_frame = ttk.LabelFrame(parent, text="Expanded Traits")
        expanded_traits_frame.pack(fill='x', padx=5, pady=5)

        for trait_type in ["core_traits", "emotional_traits", "cognitive_traits"]:
            if trait_type in self.expanded_traits:
                ttk.Label(expanded_traits_frame, text=f"{trait_type.replace('_', ' ').title()}:").pack(anchor='w')
                trait_var = tk.StringVar()
                trait_combobox = ttk.Combobox(expanded_traits_frame, textvariable=trait_var, 
                                              values=[trait["name"] for trait in self.expanded_traits[trait_type]])
                trait_combobox.pack(fill='x', padx=5, pady=2)
                setattr(self, f"{trait_type}_var", trait_var)

    def update_motivation_description(self, event):
        selected_motivation = self.motivation_var.get()
        description = self.motivations["Hero"].get(selected_motivation, "")
        self.motivation_description.config(text=description)

    def update_complication_description(self, event):
        selected_complication = self.complication_var.get()
        description = self.complications.get(selected_complication, {}).get("description", "")
        self.complication_description.config(text=description)

    def validate_character(self):
        power_level = int(self.pl_var.get())
        validation_messages = []

        # Validate stats
        stat_total = sum(int(var.get()) for var in self.stat_vars.values())
        if stat_total > power_level * 7:
            validation_messages.append(f"Total stats ({stat_total}) exceed PL limit ({power_level * 7})")

        # Validate defenses
        for defense, var in self.defense_vars.items():
            defense_value = int(var.get())
            if defense_value > power_level + 10:
                validation_messages.append(f"{defense} ({defense_value}) exceeds PL limit ({power_level + 10})")

        # Validate attack/effect and defense/toughness trade-offs
        attack_bonus = max(int(self.stat_vars['Fighting'].get()), int(self.stat_vars['Dexterity'].get()))
        effect_rank = max(int(self.stat_vars['Strength'].get()), max(int(self.powers_tree.item(item)['values'][1]) for item in self.powers_tree.get_children()))

        if attack_bonus + effect_rank > power_level * 2:
            validation_messages.append(f"Attack bonus ({attack_bonus}) + effect rank ({effect_rank}) exceeds PL limit ({power_level * 2})")

        dodge = int(self.defense_vars['Dodge'].get())
        toughness = int(self.defense_vars['Toughness'].get())
        if dodge + toughness > power_level * 2:
            validation_messages.append(f"Dodge ({dodge}) + Toughness ({toughness}) exceeds PL limit ({power_level * 2})")

        parry = int(self.defense_vars['Parry'].get())
        if parry + toughness > power_level * 2:
            validation_messages.append(f"Parry ({parry}) + Toughness ({toughness}) exceeds PL limit ({power_level * 2})")

        # Calculate total point cost
        stat_cost = sum(int(var.get()) * 2 for var in self.stat_vars.values())
        defense_cost = sum(int(var.get()) for var in self.defense_vars.values())
        skill_cost = sum(int(self.skills_tree.item(item)['values'][1]) // 2 for item in self.skills_tree.get_children())
        advantage_cost = sum(int(self.advantages_tree.item(item)['values'][1]) for item in self.advantages_tree.get_children())
        power_cost = sum(int(self.powers_tree.item(item)['values'][1]) * 2 for item in self.powers_tree.get_children())

        total_cost = stat_cost + defense_cost + skill_cost + advantage_cost + power_cost
        if total_cost > power_level * 15:
            validation_messages.append(f"Total point cost ({total_cost}) exceeds PL limit ({power_level * 15})")

        return validation_messages, total_cost

    def create_character(self):
        validation_messages, total_cost = self.validate_character()

        if validation_messages:
            self.validation_text.delete('1.0', tk.END)
            self.validation_text.insert(tk.END, "Validation Errors:\n\n")
            for message in validation_messages:
                self.validation_text.insert(tk.END, f"- {message}\n")
            self.validation_text.insert(tk.END, f"\nTotal Point Cost: {total_cost}")
            self.notebook.select(self.notebook.index('end') - 1)  # Switch to the Validation tab
            return

        # Populate character dictionary with entered data
        self.character["name"] = self.name_entry.get()
        self.character["gender"] = self.gender_entry.get()
        self.character["age"] = self.age_entry.get()
        self.character["theme"] = self.theme_var.get()
        self.character["origin"]["region"] = self.region_var.get()
        self.character["origin"]["country"] = self.country_var.get()
        self.character["origin"]["language"] = self.language_var.get()
        
        self.character["physical_traits"]["height"] = self.height_var.get()
        self.character["physical_traits"]["weight"] = self.weight_entry.get()
        self.character["physical_traits"]["eye_color"] = self.eye_color_var.get()
        self.character["physical_traits"]["hair_color"] = self.hair_color_var.get()
        self.character["physical_traits"]["skin_tone"] = self.skin_tone_var.get()
        
        self.character["costume_style"] = self.costume_style_var.get()
        self.character["distinctive_feature"] = self.distinctive_feature_var.get()
        self.character["initiative"] = int(self.initiative_var.get())
        self.character["power_level"] = int(self.pl_var.get())
        self.character["languages"] = [self.language_var.get()]
        self.character["occupation"] = self.occupation_var.get()
        
        # Stats and Defenses
        for stat_name, var in self.stat_vars.items():
            value = int(var.get())
            self.character["stats"][stat_name] = {"value": value, "cost": value * 2}
        
        # Initialize defenses
        self.character['defenses'] = {
            'Dodge': {'stat_bonus': 0, 'bought_rank': 0, 'total_rank': 0},
            'Fortitude': {'stat_bonus': 0, 'bought_rank': 0, 'total_rank': 0},
            'Parry': {'stat_bonus': 0, 'bought_rank': 0, 'total_rank': 0},
            'Toughness': {'stat_bonus': 0, 'bought_rank': 0, 'total_rank': 0},
            'Will': {'stat_bonus': 0, 'bought_rank': 0, 'total_rank': 0}
        }

        # Update defenses based on stats
        allocated_stats = {stat['name']: {'value': int(self.stat_vars[stat['name']].get())} for stat in self.stats_data['STATS']}
        self.character = update_defense(self.character, allocated_stats)

        # Update bought ranks for defenses
        for defense, var in self.defense_vars.items():
            bought_rank = int(var.get())
            self.character['defenses'][defense]['bought_rank'] = bought_rank
            self.character['defenses'][defense]['total_rank'] = self.character['defenses'][defense]['stat_bonus'] + bought_rank
        
        # Skills
        self.character["skills"] = []
        for item in self.skills_tree.get_children():
            values = self.skills_tree.item(item, 'values')
            skill_name, rank, _, _, _ = values
            if int(rank) > 0:
                self.character["skills"].append({
                    "name": skill_name,
                    "rank": int(rank),
                    "cost": int(rank)
                })
        
        # Advantages
        self.character["advantages"] = []
        for item in self.advantages_tree.get_children():
            values = self.advantages_tree.item(item, 'values')
            advantage_name, rank = values
            if int(rank) > 0:
                self.character["advantages"].append({
                    "name": advantage_name,
                    "rank": int(rank),
                    "cost": int(rank)
                })
        
        # Powers
        self.character["powers"] = []
        for item in self.powers_tree.get_children():
            values = self.powers_tree.item(item, 'values')
            power_name, rank, extras, flaws, power_type, power_range = values
            extras_list = extras.split(', ') if extras else []
            flaws_list = flaws.split(', ') if flaws else []
            
            # Find the power in the powers_data to get the 'resisted by' information
            power_info = next((p for p in self.powers_data if p['name'] == power_name), None)
            resisted_by = power_info['resisted'] if power_info and 'resisted' in power_info else 'N/A'
            
            self.character["powers"].append({
                "name": power_name,
                "rank": int(rank),
                "extras": extras_list,
                "extras_ranks": [1] * len(extras_list),  # Assuming rank 1 for all extras
                "flaws": flaws_list,
                "flaws_ranks": [1] * len(flaws_list),  # Assuming rank 1 for all flaws
                "cost": int(rank) * 2,
                "type": power_type,
                "range": power_range,
                "resisted": resisted_by
            })
        
        # Personality and Background
        self.character["personality_traits"] = {
            "positive_traits": [self.positive_traits_var.get()],
            "negative_traits": [self.negative_traits_var.get()],
            "quirky_traits": [self.quirky_traits_var.get()]
        }
        self.character["Motivation"] = {
            "name": self.motivation_var.get(),
            "description": self.motivations["Hero"].get(self.motivation_var.get(), "")
        }
        self.character["Complications"] = [{
            "name": self.complication_var.get(),
            "description": self.complications.get(self.complication_var.get(), {}).get("description", "")
        }]
        
        # Add expanded traits
        self.character["expanded_traits"] = {}
        for trait_type in ["core_traits", "emotional_traits", "cognitive_traits"]:
            if trait_type in self.expanded_traits:
                selected_trait = getattr(self, f"{trait_type}_var", tk.StringVar()).get()
                trait_info = next((trait for trait in self.expanded_traits[trait_type] if trait["name"] == selected_trait), None)
                if trait_info:
                    self.character["expanded_traits"][trait_type] = trait_info
        
        # Generate character description
        self.character["description"] = generate_character_description(self.character)
        
        # Calculate totals
        attribute_total_cost, advantage_total_cost, skill_total_cost, power_total_cost, defense_total_cost, total_cost = calculate_totals(self.character)
        self.character['total_cost'] = total_cost
        
        # Display the character
        new_tab = ttk.Frame(self.notebook)
        self.notebook.add(new_tab, text=self.character["name"])
        new_character_summary_text = tk.Text(new_tab, height=15, width=50)
        new_character_summary_text.pack(expand=True, fill='both')
        pretty_print_character(self.character, new_character_summary_text)
        self.text_widgets[new_tab] = new_character_summary_text
        self.characters[self.character["name"]] = self.character
        self.notebook.select(new_tab)
        
        messagebox.showinfo("Character Created", f"Character '{self.character['name']}' has been created and added to the notebook.")
        self.window.destroy()

def open_custom_character_window(root, notebook, text_widgets, characters, dark_mode):
    CustomCharacterCreator(root, notebook, text_widgets, characters, dark_mode)
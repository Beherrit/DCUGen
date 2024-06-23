import tkinter as tk
from tkinter import ttk, filedialog, simpledialog, messagebox
import pandas as pd
import json
import os

gm_cheat_sheet_app = None  # Global variable for GM Cheat Sheet app


class Tooltip:
    def __init__(self, widget):
        self.widget = widget
        self.tooltip_window = None

    def show(self, text, x, y):
        self.hide()  # Hide any existing tooltip before showing a new one
        if not text:
            return
        x = x + self.widget.winfo_rootx() + 25
        y = y + self.widget.winfo_rooty() + 25
        self.tooltip_window = tw = tk.Toplevel(self.widget)
        tw.wm_overrideredirect(True)
        tw.wm_geometry(f"+{x}+{y}")
        label = tk.Label(tw, text=text, background="yellow", relief="solid", borderwidth=1, font=("tahoma", "8", "normal"))
        label.pack()

    def hide(self):
        if self.tooltip_window:
            self.tooltip_window.destroy()
        self.tooltip_window = None

class GMcheatSheetApp:
    def __init__(self, master):
        self.master = master
        self.master.title("GM Cheat Sheet")
        self.master.geometry("1600x600")

        self.frame = tk.Frame(self.master)
        self.frame.pack(fill="both", expand=True)

        self.button_frame = tk.Frame(self.frame)
        self.button_frame.pack(fill="x", pady=10)

        self.add_button = ttk.Button(self.button_frame, text="Add New Character", command=self.add_character)
        self.add_button.pack(side="left", padx=5)

        self.upload_button = ttk.Button(self.button_frame, text="Upload Character", command=self.upload_character)
        self.upload_button.pack(side="left", padx=5)

        self.save_button = ttk.Button(self.button_frame, text="Save", command=self.save_data)
        self.save_button.pack(side="left", padx=5)

        self.load_button = ttk.Button(self.button_frame, text="Load", command=lambda: self.load_data("gmcheatsheet_data.json"))
        self.load_button.pack(side="left", padx=5)

        self.load_manual_button = ttk.Button(self.button_frame, text="Load Manual File", command=self.load_manual_file)
        self.load_manual_button.pack(side="left", padx=5)

        self.tree_frame = tk.Frame(self.frame)
        self.tree_frame.pack(fill="both", expand=True, padx=20, pady=10)

        self.tree_scroll_y = tk.Scrollbar(self.tree_frame, orient="vertical")
        self.tree_scroll_y.pack(side="right", fill="y")

        self.tree_scroll_x = tk.Scrollbar(self.tree_frame, orient="horizontal")
        self.tree_scroll_x.pack(side="bottom", fill="x")

        self.columns = ["CHARACTER NAME", "Strength", "Stamina", "Agility", "Dexterity", "Fighting", 
                        "Intellect", "Awareness", "Presence", "Dodge", "Fortitude", "Parry", 
                        "Willpower", "Toughness", "Initiative", "Motivation", "Complication One", 
                        "Complication Two", "Summary"]

        self.tree = ttk.Treeview(self.tree_frame, columns=self.columns, show="headings", yscrollcommand=self.tree_scroll_y.set, xscrollcommand=self.tree_scroll_x.set)

        for col in self.columns:
            if col in ["Strength", "Stamina", "Agility", "Dexterity", "Fighting", "Intellect", "Awareness", "Presence", "Dodge", "Fortitude", "Parry", "Will", "Toughness", "Initiative"]:
                self.tree.heading(col, text=col)
                self.tree.column(col, width=50, stretch=False)
            else:
                self.tree.heading(col, text=col)
                self.tree.column(col, width=150, stretch=True)

        self.tree.pack(side="left", fill="both", expand=True)
        self.tree_scroll_y.config(command=self.tree.yview)
        self.tree_scroll_x.config(command=self.tree.xview)

        self.tree.bind("<Double-1>", self.on_double_click)
        self.tree.bind("<Motion>", self.on_hover)
        self.tree.bind("<Button-3>", self.show_context_menu)  # Bind right-click to show context menu

        self.tooltip = Tooltip(self.tree)

        # Create a context menu
        self.context_menu = tk.Menu(self.tree, tearoff=0)
        self.context_menu.add_command(label="Delete Character", command=self.delete_character)

        self.load_data("gmcheatsheet_data.json")

        self.master.protocol("WM_DELETE_WINDOW", self.on_closing)

    def add_character(self):
        character_name = simpledialog.askstring("Input", "Enter CHARACTER NAME:")
        if character_name:
            row_data = [character_name] + ["0" if col not in ["CHARACTER NAME", "Motivation", "Complication One", "Complication Two", "Summary"] else "" for col in self.columns[1:]]
            self.tree.insert("", "end", values=row_data)

    def upload_character(self):
        file_path = filedialog.askopenfilename(filetypes=[("Excel files", "*.xlsx *.xls")])
        if file_path:
            try:
                df = pd.read_excel(file_path, engine='openpyxl', header=None)
                character = {
                    'name': df.iloc[1, 10],  # K2
                    'stats': {
                        'Strength': {'value': int(df.iloc[17, 13]) if not pd.isna(df.iloc[17, 13]) else ''},  # N18
                        'Stamina': {'value': int(df.iloc[21, 13]) if not pd.isna(df.iloc[21, 13]) else ''},  # N22
                        'Agility': {'value': int(df.iloc[25, 13]) if not pd.isna(df.iloc[25, 13]) else ''},  # N26
                        'Dexterity': {'value': int(df.iloc[29, 13]) if not pd.isna(df.iloc[29, 13]) else ''},  # N30
                        'Fighting': {'value': int(df.iloc[33, 13]) if not pd.isna(df.iloc[33, 13]) else ''},  # N34
                        'Intellect': {'value': int(df.iloc[37, 13]) if not pd.isna(df.iloc[37, 13]) else ''},  # N38
                        'Awareness': {'value': int(df.iloc[41, 13]) if not pd.isna(df.iloc[41, 13]) else ''},  # N42
                        'Presence': {'value': int(df.iloc[45, 13]) if not pd.isna(df.iloc[45, 13]) else ''},  # N46
                    },
                    'defenses': {
                        'Dodge': int(df.iloc[17, 25]) if not pd.isna(df.iloc[17, 25]) else '',  # Z18
                        'Fort': int(df.iloc[20, 25]) if not pd.isna(df.iloc[20, 25]) else '',  # Z21
                        'Parry': int(df.iloc[23, 25]) if not pd.isna(df.iloc[23, 25]) else '',  # Z24
                        'Will': int(df.iloc[26, 25]) if not pd.isna(df.iloc[26, 25]) else '',  # Z27
                        'Toughness': int(df.iloc[29, 25]) if not pd.isna(df.iloc[29, 25]) else '',  # Z30
                    },
                    'Init': int(df.iloc[17, 36]) if not pd.isna(df.iloc[17, 36]) else '',  # AK18
                    'Motivation': {
                        'name': str(df.iloc[87, 5]) if not pd.isna(df.iloc[87, 5]) else '',  # F88
                    },
                    'Complications': [
                        str(df.iloc[87, 36]) if not pd.isna(df.iloc[87, 36]) else '',  # AK88
                        str(df.iloc[89, 36]) if not pd.isna(df.iloc[89, 36]) else '',  # AK90
                    ]
                }

                row_data = [
                    character['name'],
                    character['stats'].get('Strength', {}).get('value', ''),
                    character['stats'].get('Stamina', {}).get('value', ''),
                    character['stats'].get('Agility', {}).get('value', ''),
                    character['stats'].get('Dexterity', {}).get('value', ''),
                    character['stats'].get('Fighting', {}).get('value', ''),
                    character['stats'].get('Intellect', {}).get('value', ''),
                    character['stats'].get('Awareness', {}).get('value', ''),
                    character['stats'].get('Presence', {}).get('value', ''),
                    character['defenses'].get('Dodge', ''),
                    character['defenses'].get('Fortitude', ''),
                    character['defenses'].get('Parry', ''),
                    character['defenses'].get('Will', ''),
                    character['defenses'].get('Toughness', ''),
                    character['initiative'],
                    character['Motivation']['name'],
                    character['Complications'][0],
                    character['Complications'][1],
                    ""  # Summary field
                ]

                self.tree.insert("", "end", values=row_data)
            except Exception as e:
                messagebox.showerror("Error", f"Failed to upload character: {e}")

    def save_data(self, filename="gmcheatsheet_data.json"):
        data = []
        for item in self.tree.get_children():
            values = self.tree.item(item, "values")
            row_data = {self.columns[i]: values[i] for i in range(len(self.columns))}
            data.append(row_data)

        with open(filename, "w") as f:
            json.dump(data, f, indent=4)

    def load_data(self, filename="gmcheatsheet_data.json"):
        if os.path.exists(filename):
            with open(filename, "r") as f:
                data = json.load(f)

            for item in self.tree.get_children():
                self.tree.delete(item)

            for row in data:
                values = [row[col] for col in self.columns]
                self.tree.insert("", "end", values=values)

    def load_manual_file(self):
        file_path = filedialog.askopenfilename(filetypes=[("JSON files", "*.json")])
        if file_path:
            self.load_data(file_path)

    def on_closing(self):
        self.save_data()
        self.master.destroy()

    def on_double_click(self, event):
        selected_items = self.tree.selection()
        if not selected_items:
            return
        
        item = selected_items[0]
        column = self.tree.identify_column(event.x)
        column_index = int(column[1:]) - 1

        def save_edit(event):
            self.tree.set(item, column, entry.get())
            entry.destroy()
            self.focus_next_cell(item, column_index)

        def cancel_edit(event):
            entry.destroy()
            self.focus_next_cell(item, column_index)

        cell_bbox = self.tree.bbox(item, column)
        if cell_bbox:
            x, y, width, height = cell_bbox
            entry = tk.Entry(self.tree)
            entry.place(x=x, y=y, width=width, height=height, anchor="nw")
            entry.insert(0, self.tree.item(item, "values")[column_index])
            entry.bind("<Return>", save_edit)
            entry.bind("<Tab>", save_edit)
            entry.bind("<FocusOut>", cancel_edit)
            entry.focus()
            entry.select_range(0, tk.END)

    def focus_next_cell(self, item, column_index):
        next_column_index = (column_index + 1) % len(self.columns)
        next_column = f"#{next_column_index + 1}"
        self.tree.focus(item)
        self.tree.selection_set(item)
        self.tree.see(item)
        self.tree.bbox(item, next_column)
        self.on_double_click_create_entry(item, next_column_index)

    def on_double_click_create_entry(self, item, column_index):
        def save_edit(event):
            self.tree.set(item, f"#{column_index + 1}", entry.get())
            entry.destroy()
            self.focus_next_cell(item, column_index)

        def cancel_edit(event):
            entry.destroy()

        cell_bbox = self.tree.bbox(item, f"#{column_index + 1}")
        if cell_bbox:
            x, y, width, height = cell_bbox
            entry = tk.Entry(self.tree)
            entry.place(x=x, y=y, width=width, height=height, anchor="nw")
            entry.insert(0, self.tree.item(item, "values")[column_index])
            entry.bind("<Return>", save_edit)
            entry.bind("<Tab>", save_edit)
            entry.bind("<FocusOut>", cancel_edit)
            entry.focus()
            entry.select_range(0, tk.END)

    def show_context_menu(self, event):
        self.context_menu.tk_popup(event.x_root, event.y_root)

    def delete_character(self):
        selected_items = self.tree.selection()
        if not selected_items:
            return
        for item in selected_items:
            self.tree.delete(item)

    def on_hover(self, event):
        region = self.tree.identify_region(event.x, event.y)
        if region == "cell":
            item = self.tree.identify_row(event.y)
            column = self.tree.identify_column(event.x)
            column_index = int(column[1:]) - 1
            if item and column_index in [15, 16, 17, 18]:  # Motivation, Complication One, Complication Two, Summary
                bbox = self.tree.bbox(item, column)
                if bbox:
                    x, y, width, height = bbox
                    values = self.tree.item(item, "values")
                    if values:
                        text = values[column_index]
                        self.tooltip.show(text, x, y)
                    else:
                        self.tooltip.hide()
                else:
                    self.tooltip.hide()
            else:
                self.tooltip.hide()
        else:
            self.tooltip.hide()

    def import_character(self, character):
        row_data = [
            character['name'],
            character['stats'].get('Strength', {}).get('value', ''),
            character['stats'].get('Stamina', {}).get('value', ''),
            character['stats'].get('Agility', {}).get('value', ''),
            character['stats'].get('Dexterity', {}).get('value', ''),
            character['stats'].get('Fighting', {}).get('value', ''),
            character['stats'].get('Intellect', {}).get('value', ''),
            character['stats'].get('Awareness', {}).get('value', ''),
            character['stats'].get('Presence', {}).get('value', ''),
            character['defenses'].get('Dodge', ''),
            character['defenses'].get('Fortitude', ''),
            character['defenses'].get('Parry', ''),
            character['defenses'].get('Will', ''),
            character['defenses'].get('Toughness', ''),
            character['initiative'],
            character['Motivation']['name'],
            character['Complications'][0],
            character['Complications'][1],
            ""  # Summary field
        ]
        self.tree.insert("", "end", values=row_data)

def open_gm_cheat_sheet():
    global gm_cheat_sheet_app
    if gm_cheat_sheet_app is None or not gm_cheat_sheet_app.master.winfo_exists():
        gm_cheat_sheet_window = tk.Toplevel()
        gm_cheat_sheet_app = GMcheatSheetApp(gm_cheat_sheet_window)
    return gm_cheat_sheet_app



if __name__ == "__main__":
    root = tk.Tk()
    app = GMcheatSheetApp(root)
    root.mainloop()

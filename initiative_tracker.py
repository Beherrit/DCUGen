import tkinter as tk
from tkinter import messagebox
from PIL import Image, ImageTk
import json
import random
import settings
import os
import ttkbootstrap as ttk
from ttkbootstrap.constants import *

global tree

class WrappingText(tk.Text):
    def __init__(self, parent, sort_callback, **kwargs):
        super().__init__(parent, **kwargs)
        self.parent = parent
        self.sort_callback = sort_callback

    def save_edit(self, item, column):
        value = self.get("1.0", "end").strip()
        tree.set(item, column, value)
        self.destroy()
        self.sort_callback()

def load_conditions():
    with open("./json/conditions.json", "r") as file:
        data = json.load(file)
    return data["conditions"]

def open_combat_calculator():
    calc_window = ttk.Toplevel()
    calc_window.title("Combat Calculator")
    calc_window.geometry("400x300")

    # Dodge Frame
    dodge_frame = ttk.Frame(calc_window, padding=10)
    dodge_frame.grid(row=0, column=0, padx=5, pady=5, sticky="nsew")

    ttk.Label(dodge_frame, text="Dodge Defense Number:").pack()
    dodge_entry = ttk.Entry(dodge_frame)
    dodge_entry.pack()

    ttk.Label(dodge_frame, text="Attacker's To Hit Roll:").pack()
    dodge_hit_entry = ttk.Entry(dodge_frame)
    dodge_hit_entry.pack()

    def calculate_dodge_hit():
        dodge = dodge_entry.get()
        to_hit = dodge_hit_entry.get()

        dodge = int(dodge) + 10 if dodge else 10
        to_hit = int(to_hit) if to_hit else 0

        result = "YOU HIT" if to_hit >= dodge else "YOU MISSED"
        messagebox.showinfo("Hit Result", result)

    ttk.Button(dodge_frame, text="Calculate Hit", command=calculate_dodge_hit, style="info.TButton").pack(pady=5)

    # Parry Frame
    parry_frame = ttk.Frame(calc_window, padding=10)
    parry_frame.grid(row=0, column=1, padx=5, pady=5, sticky="nsew")

    ttk.Label(parry_frame, text="Parry Defense Number:").pack()
    parry_entry = ttk.Entry(parry_frame)
    parry_entry.pack()

    ttk.Label(parry_frame, text="Attacker's To Hit Roll:").pack()
    parry_hit_entry = ttk.Entry(parry_frame)
    parry_hit_entry.pack()

    def calculate_parry_hit():
        parry = parry_entry.get()
        to_hit = parry_hit_entry.get()

        parry = int(parry) + 10 if parry else 10
        to_hit = int(to_hit) if to_hit else 0

        result = "YOU HIT" if to_hit >= parry else "YOU MISSED"
        messagebox.showinfo("Hit Result", result)

    ttk.Button(parry_frame, text="Calculate Hit", command=calculate_parry_hit, style="info.TButton").pack(pady=5)

    # Toughness Damage Frame
    toughness_frame = ttk.Frame(calc_window, padding=10)
    toughness_frame.grid(row=1, column=0, padx=5, pady=5, sticky="nsew")

    ttk.Label(toughness_frame, text="Attacker's Damage Value:").pack()
    damage_entry = ttk.Entry(toughness_frame)
    damage_entry.pack()

    ttk.Label(toughness_frame, text="Defender's Toughness Roll:").pack()
    defense_entry = ttk.Entry(toughness_frame)
    defense_entry.pack()

    def calculate_toughness():
        damage_value = damage_entry.get()
        defense_roll = defense_entry.get()

        damage_value = int(damage_value) + 15 if damage_value else 15
        defense_roll = int(defense_roll) if defense_roll else 0

        excess = (damage_value - defense_roll) // 5
        penalty = -excess if excess > 0 else 0
        messagebox.showinfo("Toughness Penalty", f"Penalty: {penalty}")

    ttk.Button(toughness_frame, text="Calculate Toughness", command=calculate_toughness, style="info.TButton").pack(pady=5)

    # Resistance Damage Frame
    resistance_frame = ttk.Frame(calc_window, padding=10)
    resistance_frame.grid(row=1, column=1, padx=5, pady=5, sticky="nsew")

    ttk.Label(resistance_frame, text="Attacker's Effect Rank:").pack()
    effect_rank_entry = ttk.Entry(resistance_frame)
    effect_rank_entry.pack()

    ttk.Label(resistance_frame, text="Defender's Resistance Value Rolled:").pack()
    resistance_roll_entry = ttk.Entry(resistance_frame)
    resistance_roll_entry.pack()

    def calculate_resistance():
        effect_rank = effect_rank_entry.get()
        resistance_roll = resistance_roll_entry.get()

        effect_rank = int(effect_rank) + 10 if effect_rank else 10
        resistance_roll = int(resistance_roll) if resistance_roll else 0

        excess = (effect_rank - resistance_roll) // 5
        effect = -excess if excess > 0 else 0
        messagebox.showinfo("Resistance Effect", f"Effect: {effect}")

    ttk.Button(resistance_frame, text="Calculate Resistance", command=calculate_resistance, style="info.TButton").pack(pady=5)

def open_image_window():
    def resize_image(event):
        new_width = event.width
        new_height = event.height
        img_resized = original_img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        img_tk = ImageTk.PhotoImage(img_resized)
        panel.configure(image=img_tk)
        panel.image = img_tk  # keep a reference to avoid garbage collection

    image_window = ttk.Toplevel()
    image_window.title("Toughness Calculator")
    image_window.geometry("600x600")

    original_img = Image.open("images/combat_misc/CM_ToughnessCalc.jpg")

    img_tk = ImageTk.PhotoImage(original_img)

    panel = ttk.Label(image_window, image=img_tk)
    panel.image = img_tk  # keep a reference to avoid garbage collection
    panel.pack(side="top", fill="both", expand=True)

    panel.bind('<Configure>', resize_image)

def clear_table(tree):
    for item in tree.get_children():
        tree.delete(item)

def open_condition_lookup():
    condition_window = ttk.Toplevel()
    condition_window.title("Conditions")
    condition_window.geometry("500x400")

    conditions_dict = load_conditions()
    canvas = tk.Canvas(condition_window)
    scrollbar = ttk.Scrollbar(condition_window, orient="vertical", command=canvas.yview)
    scrollable_frame = ttk.Frame(canvas)

    scrollable_frame.bind(
        "<Configure>",
        lambda e: canvas.configure(
            scrollregion=canvas.bbox("all")
        )
    )

    canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
    canvas.configure(yscrollcommand=scrollbar.set)

    def on_mousewheel(event):
        canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    canvas.bind_all("<MouseWheel>", on_mousewheel)

    for condition, description in conditions_dict.items():
        condition_label = ttk.Label(scrollable_frame, text=condition, font=("Helvetica", 10, "bold"))
        condition_label.pack(anchor="w", padx=10, pady=5)
        description_label = ttk.Label(scrollable_frame, text=description, wraplength=480, justify="left")
        description_label.pack(anchor="w", padx=10, pady=5)

    canvas.pack(side="left", fill="both", expand=True)
    scrollbar.pack(side="right", fill="y")

def open_measurement_calcs():
    calcs_window = ttk.Toplevel()
    calcs_window.title("Measurement Calcs")
    calcs_window.geometry("600x800")

    img = Image.open("./images/combat_misc/cm_calcs.jpg")
    img = img.resize((580, 780), Image.Resampling.LANCZOS)
    img = ImageTk.PhotoImage(img)

    panel = ttk.Label(calcs_window, image=img)
    panel.image = img  # keep a reference!
    panel.pack(side="top", fill="both", expand=True)

def sort_treeview(tree):
    def safe_int(value):
        return int(value) if value.isdigit() else 0
    
    tree_data = [(safe_int(tree.set(child, "Rolled Init")),
                  safe_int(tree.set(child, "Awareness")),
                  safe_int(tree.set(child, "Agility")),
                  child)
                 for child in tree.get_children('')]
    tree_data.sort(key=lambda t: (t[0], t[1], t[2]), reverse=True)

    for index, (_, _, _, child) in enumerate(tree_data):
        tree.move(child, '', index)

    for index, (_, _, _, child) in enumerate(tree_data):
        tag = 'evenrow' if index % 2 == 0 else 'oddrow'
        tree.item(child, tags=(tag,))

def load_initiative_data(tree):
    if os.path.exists("initiative_data.json"):
        with open("initiative_data.json", "r") as file:
            data = json.load(file)
        for row in data:
            tag = 'evenrow' if len(tree.get_children()) % 2 == 0 else 'oddrow'
            tree.insert("", "end", values=row, tags=(tag,))
        sort_treeview(tree)

def save_initiative_data(tree):
    with open("initiative_data.json", "w") as file:
        json.dump([], file, indent=4)

    data = [tree.item(item)["values"] for item in tree.get_children()]
    with open("initiative_data.json", "w") as file:
        json.dump(data, file, indent=4)

def get_character_data_from_selected_tab(notebook, characters):
    current_tab = notebook.select()
    tab_text = notebook.tab(current_tab, "text")
    return characters.get(tab_text, None)

def open_initiative_tracker(notebook, characters):
    global tree
    conditions_dict = load_conditions()
    conditions = list(conditions_dict.keys())

    tracker_window = ttk.Toplevel()
    tracker_window.title("Initiative Tracker")
    tracker_window.geometry("1600x600")

    style = ttk.Style()
    style.theme_use("darkly")  # You can change this to any ttkbootstrap theme

    input_frame = ttk.Frame(tracker_window)
    input_frame.grid(row=0, column=0, padx=10, pady=10, sticky="nw")

    name_label = ttk.Label(input_frame, text="Name:")
    name_label.grid(row=0, column=0, padx=5, pady=5, sticky="e")
    name_entry = ttk.Entry(input_frame)
    name_entry.grid(row=0, column=1, padx=5, pady=5)

    awareness_label = ttk.Label(input_frame, text="Awareness:")
    awareness_label.grid(row=0, column=2, padx=5, pady=5, sticky="e")
    awareness_entry = ttk.Entry(input_frame)
    awareness_entry.grid(row=0, column=3, padx=5, pady=5)

    agility_label = ttk.Label(input_frame, text="Agility:")
    agility_label.grid(row=0, column=4, padx=5, pady=5, sticky="e")
    agility_entry = ttk.Entry(input_frame)
    agility_entry.grid(row=0, column=5, padx=5, pady=5)

    initiative_label = ttk.Label(input_frame, text="Init Bonus:")
    initiative_label.grid(row=0, column=6, padx=5, pady=5, sticky="e")
    initiative_entry = ttk.Entry(input_frame)
    initiative_entry.grid(row=0, column=7, padx=5, pady=5)

    def upload_character_from_tab(notebook, characters):
        character_data = get_character_data_from_selected_tab(notebook, characters)
        if character_data:
            name = character_data.get("name", "")
            awareness = character_data.get("stats", {}).get("Awareness", {}).get("value", 0)
            agility = character_data.get("stats", {}).get("Agility", {}).get("value", 0)
            initiative = ""
            tag = 'evenrow' if len(tree.get_children()) % 2 == 0 else 'oddrow'

            tree.insert("", "end", values=(name, awareness, agility, initiative, "", "False", "Normal", "Normal", "Normal", "", "", "False", ""), tags=(tag,))
            sort_treeview(tree)

    upload_button = ttk.Button(input_frame, text="Upload from Tab", command=lambda: upload_character_from_tab(notebook, characters), style="info.TButton")
    upload_button.grid(row=1, column=1, padx=5, pady=5)

    def add_person():
        name = name_entry.get()
        awareness = int(awareness_entry.get()) if awareness_entry.get() else 0
        agility = int(agility_entry.get()) if agility_entry.get() else 0
        initiative = initiative_entry.get()
        tag = 'evenrow' if len(tree.get_children()) % 2 == 0 else 'oddrow'

        tree.insert("", "end", values=(name, awareness, agility, initiative, "", "False", "Normal", "Normal", "Normal", "", "", "False", ""), tags=(tag,))
        sort_treeview(tree)

    add_button = ttk.Button(input_frame, text="Add Person", command=add_person, style="success.TButton")
    add_button.grid(row=1, column=2, padx=5, pady=5)

    condition_button = ttk.Button(input_frame, text="Condition Lookup", command=open_condition_lookup, style="info.TButton")
    condition_button.grid(row=1, column=3, padx=5, pady=5)

    measurement_calcs_button = ttk.Button(input_frame, text="Measurement Calcs", command=open_measurement_calcs, style="info.TButton")
    measurement_calcs_button.grid(row=1, column=4, padx=5, pady=5)

    combat_calc_button = ttk.Button(input_frame, text="Combat Calculator", command=open_combat_calculator, style="info.TButton")
    combat_calc_button.grid(row=1, column=6, padx=5, pady=5)

    toggle_image_button = ttk.Button(input_frame, text="Damage Degree Reference", command=open_image_window, style="info.TButton")
    toggle_image_button.grid(row=1, column=7, padx=5, pady=5)

    save_button = ttk.Button(input_frame, text="Save Data", command=lambda: save_initiative_data(tree), style="success.TButton")
    save_button.grid(row=0, column=9, padx=5, pady=5)

    load_button = ttk.Button(input_frame, text="Load Data", command=lambda: load_initiative_data(tree), style="primary.TButton")
    load_button.grid(row=0, column=10, padx=5, pady=5)

    clear_button = ttk.Button(input_frame, text="Clear Table", command=lambda: clear_table(tree), style="danger.TButton")
    clear_button.grid(row=1, column=8, padx=5, pady=5)

    tree_frame = ttk.Frame(tracker_window)
    tree_frame.grid(row=1, column=0, columnspan=16, padx=20, pady=20, sticky="nsew")

    tree_scroll_y = ttk.Scrollbar(tree_frame, orient="vertical")
    tree_scroll_y.pack(side="right", fill="y")

    tree_scroll_x = ttk.Scrollbar(tree_frame, orient="horizontal")
    tree_scroll_x.pack(side="bottom", fill="x")

    columns = ("Name", "Awareness", "Agility", "Init Bonus", "Rolled Init", "Hold Action", "Condition 1", "Condition 2", "Condition 3", "Toughness", "Will", "Dead", "Description")
    
    # Create a custom style for the Treeview
    style.configure("Custom.Treeview", rowheight=50)  # Increase row height to 50 pixels
    
    tree = ttk.Treeview(tree_frame, columns=columns, show="headings", yscrollcommand=tree_scroll_y.set, xscrollcommand=tree_scroll_x.set, style="Custom.Treeview")

    # Configure alternating row colors
    tree.tag_configure('oddrow', background='#2a3038')
    tree.tag_configure('evenrow', background='#1e2329')

    for col in columns:
        tree.heading(col, text=col)
        tree.column(col, width=120, stretch=True)

    tree.column("Name", width=180)
    tree.column("Description", width=450)

    tree.pack(side="left", fill="both", expand=True)
    tree_scroll_y.config(command=tree.yview)
    tree_scroll_x.config(command=tree.xview)

    tracker_window.grid_rowconfigure(1, weight=1)
    tracker_window.grid_columnconfigure(0, weight=1)

    right_click_menu = ttk.Menu(tracker_window, tearoff=0)
    right_click_menu.add_command(label="Remove/Delete", command=lambda: remove_selected_item(tree))

    def right_click_action(event):
        try:
            row_id = tree.identify_row(event.y)
            tree.selection_set(row_id)
            right_click_menu.post(event.x_root, event.y_root)
        finally:
            right_click_menu.grab_release()

    tree.bind("<Button-3>", right_click_action)

    def remove_selected_item(tree):
        selected_item = tree.selection()
        if selected_item:
            tree.delete(selected_item)
            for index, item in enumerate(tree.get_children()):
                tag = 'evenrow' if index % 2 == 0 else 'oddrow'
                tree.item(item, tags=(tag,))

    def edit_cell(event):
        item = tree.selection()[0]
        column = tree.identify_column(event.x)
        column_index = int(column[1:]) - 1

        def save_edit(item, column, value):
            tree.set(item, column, value)
            sort_treeview(tree)

        def focus_out(event):
            widget = event.widget
            value = widget.get() if isinstance(widget, ttk.Entry) else widget.get("1.0", "end").strip()
            save_edit(item, column, value)
            tree.focus()
            widget.destroy()

        def on_key_press(event, save_edit, widget):
            if event.keysym in ("Tab", "Return"):
                save_edit(item, column, widget.get())
                widget.event_generate("<FocusOut>")
                next_column = f"#{column_index + 2}" if event.keysym == "Tab" else column
                edit_next_cell(item, next_column)

        cell_bbox = tree.bbox(item, column)

        if column_index in [5, 11]:  # Hold Action and Dead columns
            combobox = ttk.Combobox(tree, values=["True", "False"], style="info.TCombobox")
            combobox.set(tree.set(item, column))
            combobox.place(x=cell_bbox[0], y=cell_bbox[1], width=cell_bbox[2], height=cell_bbox[3], anchor="nw")
            combobox.bind("<<ComboboxSelected>>", lambda e: focus_out(e))
            combobox.bind("<FocusOut>", focus_out)
            combobox.bind("<KeyPress>", lambda e: on_key_press(e, save_edit, combobox))
            combobox.focus()
        elif column_index in [6, 7, 8]:  # Condition columns
            combobox = ttk.Combobox(tree, values=conditions, style="info.TCombobox")
            combobox.set(tree.set(item, column))
            combobox.place(x=cell_bbox[0], y=cell_bbox[1], width=cell_bbox[2], height=cell_bbox[3], anchor="nw")
            combobox.bind("<<ComboboxSelected>>", lambda e: focus_out(e))
            combobox.bind("<FocusOut>", focus_out)
            combobox.bind("<KeyPress>", lambda e: on_key_press(e, save_edit, combobox))
            combobox.focus()
        elif column_index == 12:  # Description column
            text_widget = WrappingText(tree, lambda: sort_treeview(tree), wrap="word", height=10, width=50)
            text_widget.insert("1.0", tree.set(item, column))
            text_widget.place(x=cell_bbox[0], y=cell_bbox[1], width=cell_bbox[2], height=cell_bbox[3], anchor="nw")
            text_widget.bind("<FocusOut>", lambda e: text_widget.save_edit(item, column))
            text_widget.bind("<KeyPress>", lambda e: on_key_press(e, save_edit, text_widget))
            text_widget.focus()
        else:  # Other columns including "Rolled Init"
            entry = ttk.Entry(tree)
            entry.insert(0, tree.set(item, column))
            entry.place(x=cell_bbox[0], y=cell_bbox[1], width=cell_bbox[2], height=cell_bbox[3], anchor="nw")
            entry.bind("<FocusOut>", focus_out)
            entry.bind("<KeyPress>", lambda e: on_key_press(e, save_edit, entry))
            entry.focus()

    def edit_next_cell(item, next_column):
        tree.focus(item)
        tree.selection_set(item)
        x = tree.bbox(item, next_column)[0] + 1
        y = tree.bbox(item, next_column)[1] + 1
        event = tk.Event()
        event.x, event.y = x, y
        edit_cell(event)

    tree.bind("<Double-1>", edit_cell)
    load_initiative_data(tree)
    tracker_window.protocol("WM_DELETE_WINDOW", lambda: [save_initiative_data(tree), tracker_window.destroy()])
    tracker_window.mainloop()

if __name__ == "__main__":
    root = tk.Tk()
    root.withdraw()
    open_initiative_tracker(None, {})
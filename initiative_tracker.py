import tkinter as tk
from tkinter import ttk, messagebox
from PIL import Image, ImageTk
import json
import random
import settings  # Import the settings module

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
    calc_window = tk.Toplevel()
    calc_window.title("Combat Calculator")
    calc_window.geometry("400x300")
    settings.apply_current_theme(calc_window)  # Apply current theme

    # Dodge Frame
    dodge_frame = tk.Frame(calc_window, bd=2, relief="sunken")
    dodge_frame.grid(row=0, column=0, padx=5, pady=5, sticky="nsew")

    tk.Label(dodge_frame, text="Ranged Attack:").pack()
    dodge_entry = tk.Entry(dodge_frame)
    dodge_entry.pack()

    tk.Label(dodge_frame, text="Attacker's To Hit Roll:").pack()
    dodge_hit_entry = tk.Entry(dodge_frame)
    dodge_hit_entry.pack()

    def calculate_dodge_hit():
        dodge = dodge_entry.get()
        to_hit = dodge_hit_entry.get()

        dodge = int(dodge) + 10 if dodge else 10
        to_hit = int(to_hit) if to_hit else 0

        result = "YOU HIT" if to_hit >= dodge else "YOU MISSED"
        messagebox.showinfo("Hit Result", result)

    tk.Button(dodge_frame, text="Calculate Hit", command=calculate_dodge_hit).pack()

    # Parry Frame
    parry_frame = tk.Frame(calc_window, bd=2, relief="sunken")
    parry_frame.grid(row=0, column=1, padx=5, pady=5, sticky="nsew")

    tk.Label(parry_frame, text="Melee Attack:").pack()
    parry_entry = tk.Entry(parry_frame)
    parry_entry.pack()

    tk.Label(parry_frame, text="Attacker's To Hit Roll:").pack()
    parry_hit_entry = tk.Entry(parry_frame)
    parry_hit_entry.pack()

    def calculate_parry_hit():
        parry = parry_entry.get()
        to_hit = parry_hit_entry.get()

        parry = int(parry) + 10 if parry else 10
        to_hit = int(to_hit) if to_hit else 0

        result = "YOU HIT" if to_hit >= parry else "YOU MISSED"
        messagebox.showinfo("Hit Result", result)

    tk.Button(parry_frame, text="Calculate Hit", command=calculate_parry_hit).pack()

    # Toughness Damage Frame
    toughness_frame = tk.Frame(calc_window, bd=2, relief="sunken")
    toughness_frame.grid(row=1, column=0, padx=5, pady=5, sticky="nsew")

    tk.Label(toughness_frame, text="Attacker's Damage Value:").pack()
    damage_entry = tk.Entry(toughness_frame)
    damage_entry.pack()

    tk.Label(toughness_frame, text="Defender's Toughness Roll:").pack()
    defense_entry = tk.Entry(toughness_frame)
    defense_entry.pack()

    def calculate_toughness():
        damage_value = damage_entry.get()
        defense_roll = defense_entry.get()

        damage_value = int(damage_value) + 15 if damage_value else 15
        defense_roll = int(defense_roll) if defense_roll else 0

        excess = (damage_value - defense_roll) // 5
        penalty = -excess if excess > 0 else 0
        messagebox.showinfo("Toughness Penalty", f"Penalty: {penalty}")

    tk.Button(toughness_frame, text="Calculate Toughness", command=calculate_toughness).pack()

    # Resistance Damage Frame
    resistance_frame = tk.Frame(calc_window, bd=2, relief="sunken")
    resistance_frame.grid(row=1, column=1, padx=5, pady=5, sticky="nsew")

    tk.Label(resistance_frame, text="Attacker's Effect Rank:").pack()
    effect_rank_entry = tk.Entry(resistance_frame)
    effect_rank_entry.pack()

    tk.Label(resistance_frame, text="Defender's Resistance Value Rolled:").pack()
    resistance_roll_entry = tk.Entry(resistance_frame)
    resistance_roll_entry.pack()

    def calculate_resistance():
        effect_rank = effect_rank_entry.get()
        resistance_roll = resistance_roll_entry.get()

        effect_rank = int(effect_rank) + 10 if effect_rank else 10
        resistance_roll = int(resistance_roll) if resistance_roll else 0

        excess = (effect_rank - resistance_roll) // 5
        effect = -excess if excess > 0 else 0
        messagebox.showinfo("Resistance Effect", f"Effect: {effect}")

    tk.Button(resistance_frame, text="Calculate Resistance", command=calculate_resistance).pack()

def open_image_window():
    def resize_image(event):
        new_width = event.width
        new_height = event.height
        img_resized = original_img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        img_tk = ImageTk.PhotoImage(img_resized)
        panel.configure(image=img_tk)
        panel.image = img_tk  # keep a reference to avoid garbage collection

    image_window = tk.Toplevel()
    image_window.title("Toughness Calculator")
    image_window.geometry("600x600")
    settings.apply_current_theme(image_window)  # Apply current theme

    original_img = Image.open("images/combat_misc/CM_ToughnessCalc.jpg")

    img_tk = ImageTk.PhotoImage(original_img)

    panel = tk.Label(image_window, image=img_tk)
    panel.image = img_tk  # keep a reference to avoid garbage collection
    panel.pack(side="top", fill="both", expand=True)

    panel.bind('<Configure>', resize_image)

def open_initiative_tracker():
    conditions_dict = load_conditions()
    conditions = list(conditions_dict.keys())

    tracker_window = tk.Toplevel()
    tracker_window.title("Initiative Tracker")
    tracker_window.geometry("1600x600")
    settings.apply_current_theme(tracker_window)  # Apply current theme

    # Configure styles
    style = ttk.Style()
    style.configure("TCombobox", arrowsize=15)  # Set the arrow size for comboboxes

    # Frame for input fields
    input_frame = tk.Frame(tracker_window)
    input_frame.grid(row=0, column=0, padx=10, pady=10, sticky="nw")

    # Input fields for name, awareness, agility, initiative
    name_label = tk.Label(input_frame, text="Name:")
    name_label.grid(row=0, column=0, padx=5, pady=5, sticky="e")
    name_entry = tk.Entry(input_frame)
    name_entry.grid(row=0, column=1, padx=5, pady=5)

    awareness_label = tk.Label(input_frame, text="Awareness:")
    awareness_label.grid(row=1, column=0, padx=5, pady=5, sticky="e")
    awareness_entry = tk.Entry(input_frame)
    awareness_entry.grid(row=1, column=1, padx=5, pady=5)

    agility_label = tk.Label(input_frame, text="Agility:")
    agility_label.grid(row=2, column=0, padx=5, pady=5, sticky="e")
    agility_entry = tk.Entry(input_frame)
    agility_entry.grid(row=2, column=1, padx=5, pady=5)

    initiative_label = tk.Label(input_frame, text="Initiative:")
    initiative_label.grid(row=3, column=0, padx=5, pady=5, sticky="e")
    initiative_entry = tk.Entry(input_frame)
    initiative_entry.grid(row=3, column=1, padx=5, pady=5)

    add_button = tk.Button(input_frame, text="Add Person", command=lambda: add_person())
    add_button.grid(row=4, column=0, columnspan=2, pady=10)

    # Frame for the treeview and scrollbar
    tree_frame = tk.Frame(tracker_window)
    tree_frame.grid(row=1, column=0, columnspan=8, padx=20, pady=20, sticky="nsew")

    # Adding scrollbar for the treeview
    tree_scroll_y = tk.Scrollbar(tree_frame, orient="vertical")
    tree_scroll_y.pack(side="right", fill="y")

    tree_scroll_x = tk.Scrollbar(tree_frame, orient="horizontal")
    tree_scroll_x.pack(side="bottom", fill="x")

    # Treeview for displaying initiative order
    columns = ("Name", "Awareness", "Agility", "Initiative", "Hold Action", "Condition 1", "Condition 2", "Condition 3", "Toughness", "Will", "Dead", "Description")
    global tree
    tree = ttk.Treeview(tree_frame, columns=columns, show="headings", yscrollcommand=tree_scroll_y.set, xscrollcommand=tree_scroll_x.set)

    # Adjusting column sizes
    tree.heading("Name", text="Name")
    tree.column("Name", width=100, stretch=True)
    
    tree.heading("Awareness", text="Awareness")
    tree.column("Awareness", width=80, stretch=True)
    
    tree.heading("Agility", text="Agility")
    tree.column("Agility", width=80, stretch=True)
    
    tree.heading("Initiative", text="Initiative")
    tree.column("Initiative", width=80, stretch=True)
    
    tree.heading("Hold Action", text="Hold Action")
    tree.column("Hold Action", width=80, stretch=True)
    
    tree.heading("Condition 1", text="Condition 1")
    tree.column("Condition 1", width=80, stretch=True)
    
    tree.heading("Condition 2", text="Condition 2")
    tree.column("Condition 2", width=80, stretch=True)
    
    tree.heading("Condition 3", text="Condition 3")
    tree.column("Condition 3", width=80, stretch=True)
    
    tree.heading("Toughness", text="Toughness")
    tree.column("Toughness", width=80, stretch=True)
    
    tree.heading("Will", text="Will")
    tree.column("Will", width=80, stretch=True)
    
    tree.heading("Dead", text="Dead")
    tree.column("Dead", width=80, stretch=True)
    
    tree.heading("Description", text="Description")
    tree.column("Description", width=400, stretch=True)

    tree.pack(side="left", fill="both", expand=True)
    tree_scroll_y.config(command=tree.yview)
    tree_scroll_x.config(command=tree.xview)

    tracker_window.grid_rowconfigure(1, weight=1)
    tracker_window.grid_columnconfigure(0, weight=1)

    # Right-click context menu for deleting rows
    right_click_menu = tk.Menu(tracker_window, tearoff=0)
    right_click_menu.add_command(label="Remove/Delete", command=lambda: remove_selected_item())

    def right_click_action(event):
        try:
            row_id = tree.identify_row(event.y)
            if row_id:
                tree.selection_set(row_id)
                right_click_menu.post(event.x_root, event.y_root)
        finally:
            right_click_menu.grab_release()

    tree.bind("<Button-3>", right_click_action)

    def remove_selected_item():
        selected_item = tree.selection()
        if selected_item:
            tree.delete(selected_item)

    def add_person():
        name = name_entry.get()
        awareness = int(awareness_entry.get()) if awareness_entry.get() else 0
        agility = int(agility_entry.get()) if agility_entry.get() else 0
        initiative = int(initiative_entry.get()) if initiative_entry.get() else 0

        tree.insert("", "end", values=(name, awareness, agility, initiative, "False", "Normal", "Normal", "Normal", "", "", "False", ""))
        sort_treeview()

    def sort_treeview():
        tree_data = [(tree.set(child, "Initiative"), tree.set(child, "Awareness"), tree.set(child, "Agility"), child)
                     for child in tree.get_children('')]
        tree_data.sort(key=lambda t: (int(t[0]), int(t[1]), int(t[2])), reverse=True)

        for index, (_, _, _, child) in enumerate(tree_data):
            tree.move(child, '', index)

    def edit_cell(event):
        item = tree.selection()[0]
        column = tree.identify_column(event.x)
        column_index = int(column[1:]) - 1

        def save_edit(item, column, value):
            tree.set(item, column, value)
            sort_treeview()

        def focus_out(event):
            widget = event.widget
            if isinstance(widget, ttk.Combobox):
                save_edit(item, column, widget.get())
            else:
                value = widget.get() if isinstance(widget, tk.Entry) else widget.get("1.0", "end").strip()
                save_edit(item, column, value)
            widget.destroy()

        cell_bbox = tree.bbox(item, column)

        if column_index in [4, 10]:  # Hold Action and Dead columns
            combobox = ttk.Combobox(tree, values=["True", "False"], style="TCombobox")
            combobox.set(tree.set(item, column))
            combobox.place(x=cell_bbox[0], y=cell_bbox[1], width=cell_bbox[2], height=cell_bbox[3], anchor="nw")
            combobox.bind("<<ComboboxSelected>>", lambda e: focus_out(e))
            combobox.bind("<FocusOut>", focus_out)
            combobox.focus()
        elif column_index in [5, 6, 7]:  # Condition columns
            combobox = ttk.Combobox(tree, values=conditions, style="TCombobox")
            combobox.set(tree.set(item, column))
            combobox.place(x=cell_bbox[0], y=cell_bbox[1], width=cell_bbox[2], height=cell_bbox[3], anchor="nw")
            combobox.bind("<<ComboboxSelected>>", lambda e: focus_out(e))
            combobox.bind("<FocusOut>", focus_out)
            combobox.focus()
        elif column_index == 11:  # Description column
            text_widget = WrappingText(tree, sort_treeview, wrap="word", height=10, width=50)
            text_widget.insert("1.0", tree.set(item, column))
            text_widget.place(x=cell_bbox[0], y=cell_bbox[1], width=cell_bbox[2], height=cell_bbox[3], anchor="nw")
            text_widget.bind("<FocusOut>", lambda e: text_widget.save_edit(item, column))
            text_widget.focus()
        else:  # Other columns
            entry = tk.Entry(tree)
            entry.insert(0, tree.set(item, column))
            entry.place(x=cell_bbox[0], y=cell_bbox[1], width=cell_bbox[2], height=cell_bbox[3], anchor="nw")
            entry.bind("<FocusOut>", focus_out)
            entry.focus()

    tree.bind("<Double-1>", edit_cell)

    def open_condition_lookup():
        condition_window = tk.Toplevel()
        condition_window.title("Conditions")
        condition_window.geometry("500x400")
        settings.apply_current_theme(condition_window)  # Apply current theme

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
            condition_label = tk.Label(scrollable_frame, text=condition, font=("Helvetica", 10, "bold"))
            condition_label.pack(anchor="w", padx=10, pady=5)
            description_label = tk.Label(scrollable_frame, text=description, wraplength=480, justify="left")
            description_label.pack(anchor="w", padx=10, pady=5)

        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

    def open_measurement_calcs():
        calcs_window = tk.Toplevel()
        calcs_window.title("Measurement Calcs")
        calcs_window.geometry("600x800")
        settings.apply_current_theme(calcs_window)  # Apply current theme

        img = Image.open("./images/combat_misc/cm_calcs.jpg")
        img = img.resize((580, 780), Image.Resampling.LANCZOS)
        img = ImageTk.PhotoImage(img)

        panel = tk.Label(calcs_window, image=img)
        panel.image = img  # keep a reference!
        panel.pack(side="top", fill="both", expand=True)

    condition_button = tk.Button(tracker_window, text="Condition Lookup", command=open_condition_lookup)
    condition_button.grid(row=0, column=1, padx=5, pady=5, sticky="e")

    measurement_calcs_button = tk.Button(tracker_window, text="Measurement Calcs", command=open_measurement_calcs)
    measurement_calcs_button.grid(row=0, column=2, padx=5, pady=5, sticky="e")

    dice_roller_button = tk.Button(tracker_window, text="Dice Roller", command=open_dice_roller)
    dice_roller_button.grid(row=0, column=3, padx=5, pady=5, sticky="e")

    combat_calc_button = tk.Button(tracker_window, text="Combat Calculator", command=open_combat_calculator)
    combat_calc_button.grid(row=0, column=4, padx=5, pady=5, sticky="e")

    toggle_image_button = tk.Button(tracker_window, text="Damage Degree Reference", command=open_image_window)
    toggle_image_button.grid(row=0, column=5, padx=5, pady=5, sticky="e")

    tracker_window.mainloop()

def open_dice_roller():
    dice_window = tk.Toplevel()
    dice_window.title("Dice Roller")
    dice_window.geometry("200x400")
    settings.apply_current_theme(dice_window)  # Apply current theme

    def roll_and_display(dice_type):
        result = roll_dice(dice_type)
        result_label.config(text=f"Result: {result}")

    ttk.Label(dice_window, text="Select a die to roll:").pack(pady=10)

    dice_types = [20, 12, 10, 8, 6, 4, 3, 2, 100]
    for dice in dice_types:
        ttk.Button(dice_window, text=f"D{dice}", command=lambda dice=dice: roll_and_display(dice)).pack(padx=5, pady=5)

    result_label = ttk.Label(dice_window, text="Result: ")
    result_label.pack(pady=10)

def roll_dice(dice_type):
    return random.randint(1, dice_type)

if __name__ == "__main__":
    root = tk.Tk()
    open_initiative_tracker()
    root.mainloop()

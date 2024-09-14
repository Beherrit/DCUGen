import tkinter as tk
from PIL import Image, ImageTk
import json
import random
import settings
import os
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from tooltip import ToolTip
from tkinter import filedialog

global tree, data_changed

class WrappingText(tk.Text):
    def __init__(self, parent, sort_callback, **kwargs):
        super().__init__(parent, **kwargs)
        self.parent = parent
        self.sort_callback = sort_callback

    def save_edit(self, item, column):
        value = self.get("1.0", "end-1c").strip()  # Get text without the final newline
        tree.set(item, column, value)
        self.destroy()
        self.sort_callback()

def load_conditions():
    with open("./json/conditions.json", "r") as file:
        data = json.load(file)
    return data["conditions"]

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
    
    tree_data = [(safe_int(tree.set(child, "Init Total")),
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
    global data_changed
    file_path = filedialog.askopenfilename(filetypes=[("JSON files", "*.json"), ("All files", "*.*")])
    if not file_path:  # If the user cancels the load operation
        return

    with open(file_path, "r") as file:
        data = json.load(file)
    
    clear_table(tree)  # Clear existing data before loading new data
    
    for row in data:
        # Ensure the row has the correct number of elements
        while len(row) < 16:  # Adjust this number if you add more columns
            row.append("")
        # Ensure boolean values are strings
        row[6] = str(row[6])  # Hold Action
        tag = 'evenrow' if len(tree.get_children()) % 2 == 0 else 'oddrow'
        tree.insert("", "end", values=row, tags=(tag,))
    sort_treeview(tree)
    data_changed = False

def save_initiative_data(tree):
    global data_changed
    file_path = filedialog.asksaveasfilename(defaultextension=".json",
                                             filetypes=[("JSON files", "*.json"), ("All files", "*.*")])
    if not file_path:  # If the user cancels the save operation
        return

    data = [tree.item(item)["values"] for item in tree.get_children()]
    with open(file_path, "w") as file:
        json.dump(data, file, indent=4)
    data_changed = False

def get_character_data_from_selected_tab(notebook, characters):
    current_tab = notebook.select()
    tab_text = notebook.tab(current_tab, "text")
    return characters.get(tab_text, None)

def open_initiative_tracker(notebook, characters, preloaded_data=None):
    global tree, data_changed
    data_changed = False
    conditions_dict = load_conditions()
    conditions = list(conditions_dict.keys())

    # Close all existing Initiative Tracker windows
    for widget in notebook.winfo_toplevel().winfo_children():
        if isinstance(widget, ttk.Toplevel) and widget.wm_title() == "Initiative Tracker":
            widget.destroy()

    tracker_window = ttk.Toplevel()
    tracker_window.title("Initiative Tracker")
    tracker_window.geometry("1600x800")

    style = ttk.Style()
    style.theme_use("darkly")  # You can change this to any ttkbootstrap theme

    main_frame = ttk.Frame(tracker_window)
    main_frame.pack(fill=tk.BOTH, expand=tk.YES)

    input_frame = ttk.Frame(main_frame)
    input_frame.pack(side=tk.TOP, fill=tk.X, padx=10, pady=10)

    tree_frame = ttk.Frame(main_frame)
    tree_frame.pack(side=tk.BOTTOM, fill=tk.BOTH, expand=tk.YES, padx=20, pady=20)

    # Input fields
    fields = [
        ("Name", 0, 0), ("Awareness", 0, 2), ("Agility", 0, 4),
        ("Init Bonus", 0, 6)
    ]
    entries = {}
    for field, row, col in fields:
        ttk.Label(input_frame, text=f"{field}:").grid(row=row, column=col, padx=5, pady=5, sticky="e")
        entry = ttk.Entry(input_frame)
        entry.grid(row=row, column=col+1, padx=5, pady=5)
        entries[field.lower().replace(" ", "_")] = entry

    def add_person():
        global data_changed
        name = entries['name'].get()
        awareness = int(entries['awareness'].get()) if entries['awareness'].get() else 0
        agility = int(entries['agility'].get()) if entries['agility'].get() else 0
        init_bonus = int(entries['init_bonus'].get()) if entries['init_bonus'].get() else 0
        rolled_init = 0  # Initialize as 0, will be editable later
        init_total = init_bonus + rolled_init
        tag = 'evenrow' if len(tree.get_children()) % 2 == 0 else 'oddrow'

        tree.insert("", "end", values=(name, awareness, agility, init_bonus, rolled_init, init_total, "False", "Normal", "Normal", "Normal", "", "", "", "", "", ""), tags=(tag,))
        sort_treeview(tree)

        # Clear the entry fields after adding a person
        for entry in entries.values():
            entry.delete(0, tk.END)

        data_changed = True

    def upload_character_from_tab():
        character_data = get_character_data_from_selected_tab(notebook, characters)
        if character_data:
            name = character_data.get("name", "")
            awareness = character_data.get("stats", {}).get("Awareness", {}).get("value", 0)
            agility = character_data.get("stats", {}).get("Agility", {}).get("value", 0)
            
            # Calculate initiative bonus
            initiative_bonus = character_data.get("initiative", 0)
            if isinstance(initiative_bonus, dict):
                initiative_bonus = initiative_bonus.get("total", 0)
            
            rolled_init = 0  # Initialize as 0, will be editable later
            init_total = initiative_bonus + rolled_init
            tag = 'evenrow' if len(tree.get_children()) % 2 == 0 else 'oddrow'

            tree.insert("", "end", values=(name, awareness, agility, initiative_bonus, rolled_init, init_total, "False", "Normal", "Normal", "Normal", "", "", "", "", "", ""), tags=(tag,))
            sort_treeview(tree)

    # Buttons
    buttons = [
        ("Upload from Tab", upload_character_from_tab, 1, 0),
        ("Add Person", add_person, 1, 2),
        ("Condition Lookup", open_condition_lookup, 1, 4),
        ("Measurement Calcs", open_measurement_calcs, 1, 6),
        ("Damage Degree Reference", open_image_window, 2, 0),
        ("Save Data to JSON", lambda: save_initiative_data(tree), 2, 2),
        ("Load Data from JSON", lambda: load_initiative_data(tree), 2, 4),
        ("Clear Table", lambda: clear_table(tree), 2, 6)
    ]
    for text, command, row, col in buttons:
        ttk.Button(input_frame, text=text, command=command, style="info.TButton").grid(row=row, column=col, columnspan=2, padx=5, pady=5, sticky="ew")

    # Lock Window Checkbox
    lock_window_var = tk.BooleanVar()
    lock_window_button = ttk.Checkbutton(input_frame, text="Lock Window", variable=lock_window_var, 
                                         command=lambda: toggle_window_lock(tracker_window, lock_window_var),
                                         style='primary.TCheckbutton')
    lock_window_button.grid(row=3, column=0, columnspan=2, padx=5, pady=5, sticky="w")
    ToolTip(lock_window_button, "Toggle window lock to keep it on top of other windows.")

    # Treeview
    columns = ("Name", "Awareness", "Agility", "Init Bonus", "Rolled Init", "Init Total", "Hold Action", 
               "Condition 1", "Condition 2", "Condition 3", "Toughness", "Will", "Fort", "Dodge", "Parry", "Description")
    
    style.configure("Custom.Treeview", rowheight=50)
    
    tree = ttk.Treeview(tree_frame, columns=columns, show="headings", style="Custom.Treeview")
    tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=tk.YES)

    tree_scroll_y = ttk.Scrollbar(tree_frame, orient="vertical", command=tree.yview)
    tree_scroll_y.pack(side=tk.RIGHT, fill=tk.Y)

    tree_scroll_x = ttk.Scrollbar(tree_frame, orient="horizontal", command=tree.xview)
    tree_scroll_x.pack(side=tk.BOTTOM, fill=tk.X)

    tree.configure(yscrollcommand=tree_scroll_y.set, xscrollcommand=tree_scroll_x.set)

    tree.tag_configure('oddrow', background='#2a3038')
    tree.tag_configure('evenrow', background='#1e2329')

    for col in columns:
        tree.heading(col, text=col, command=lambda _col=col: sort_treeview(tree, _col, False))
        tree.column(col, width=100)  # Adjust width as needed

    # Adjust specific column widths
    tree.column("Name", width=120)
    tree.column("Awareness", width=70)
    tree.column("Agility", width=70)
    tree.column("Init Bonus", width=70)
    tree.column("Rolled Init", width=70)
    tree.column("Init Total", width=70)
    tree.column("Description", width=150)
    tree.column("Fort", width=70)
    tree.column("Dodge", width=70)
    tree.column("Parry", width=70)
    tree.column("Toughness", width=70)
    tree.column("Will", width=70)    
    tree.column("Condition 1", width=70)
    tree.column("Condition 2", width=70)
    tree.column("Condition 3", width=70)

    # Right-click menu and bindings
    right_click_menu = ttk.Menu(tracker_window, tearoff=0)
    right_click_menu.add_command(label="Remove/Delete", command=lambda: remove_selected_item(tree))

    tree.bind("<Button-3>", lambda event: right_click_action(event, tree, right_click_menu))
    tree.bind("<Double-1>", lambda event: edit_cell(event, tree, conditions))

    def on_data_change(*args):
        global data_changed
        data_changed = True

    tree.bind('<<TreeviewSelect>>', on_data_change)
    tree.bind('<KeyRelease>', on_data_change)

    if preloaded_data:
        load_preloaded_data(tree, preloaded_data)
    
    def on_closing():
        global data_changed
        if data_changed:
            save_initiative_data(tree)
        tracker_window.destroy()

    tracker_window.protocol("WM_DELETE_WINDOW", on_closing)

    def update_init_total(event):
        item = tree.focus()
        if item:
            init_bonus = safe_int(tree.set(item, "Init Bonus"))
            rolled_init = safe_int(tree.set(item, "Rolled Init"))
            init_total = init_bonus + rolled_init
            tree.set(item, "Init Total", str(init_total))
            sort_treeview(tree)

    tree.bind("<<TreeviewSelect>>", update_init_total)

    return tracker_window

def update_initiative_tracker(tracker_window, preloaded_data):
    global tree
    if not tracker_window or not hasattr(tracker_window, 'winfo_exists') or not tracker_window.winfo_exists():
        return False  # Return False if the window doesn't exist

    try:
        for data in preloaded_data:
            name, awareness, agility, initiative = data
            existing_item = find_existing_item(tree, name)
            
            if existing_item:
                tree.item(existing_item, values=(name, awareness, agility, initiative, "", "False", "Normal", "Normal", "Normal", "", "", "False", ""))
            else:
                tag = 'evenrow' if len(tree.get_children()) % 2 == 0 else 'oddrow'
                tree.insert("", "end", values=(name, awareness, agility, initiative, "", "False", "Normal", "Normal", "Normal", "", "", "False", ""), tags=(tag,))
        
        sort_treeview(tree)
        return True  # Return True if update was successful
    except Exception as e:
        print(f"Error updating initiative tracker: {e}")
        return False  # Return False if an error occurred

def find_existing_item(tree, name):
    for item in tree.get_children():
        if tree.item(item)['values'][0] == name:
            return item
    return None

def right_click_action(event, tree, menu):
    try:
        row_id = tree.identify_row(event.y)
        tree.selection_set(row_id)
        menu.post(event.x_root, event.y_root)
    finally:
        menu.grab_release()

def remove_selected_item(tree):
    global data_changed
    selected_item = tree.selection()
    if selected_item:
        tree.delete(selected_item)
        for index, item in enumerate(tree.get_children()):
            tag = 'evenrow' if index % 2 == 0 else 'oddrow'
            tree.item(item, tags=(tag,))
        data_changed = True

def edit_cell(event, tree, conditions):
    item = tree.selection()[0]
    column = tree.identify_column(event.x)
    column_index = int(column[1:]) - 1

    cell_bbox = tree.bbox(item, column)

    if column_index == 5:  # Init Total column
        return  # Make Init Total not editable
    elif column_index == 6:  # Hold Action column
        combobox = ttk.Combobox(tree, values=["False", "True"], style="info.TCombobox")
        combobox.set(tree.set(item, column))
        setup_edit_widget(combobox, tree, item, column, cell_bbox)
    elif column_index in [7, 8, 9]:  # Condition columns
        combobox = ttk.Combobox(tree, values=conditions, style="info.TCombobox")
        combobox.set(tree.set(item, column))
        setup_edit_widget(combobox, tree, item, column, cell_bbox)
    elif column_index in [3, 4]:  # Init Bonus or Rolled Init columns
        entry = ttk.Entry(tree)
        entry.insert(0, tree.set(item, column))
        setup_edit_widget(entry, tree, item, column, cell_bbox)
        entry.bind("<FocusOut>", lambda e: update_init_total_on_edit(e.widget, tree, item, column))
        entry.bind("<Return>", lambda e: update_init_total_on_edit(e.widget, tree, item, column))
    else:  # Other columns
        entry = ttk.Entry(tree)
        entry.insert(0, tree.set(item, column))
        setup_edit_widget(entry, tree, item, column, cell_bbox)

def setup_edit_widget(widget, tree, item, column, cell_bbox):
    if isinstance(widget, ttk.Combobox):
        widget.set(tree.set(item, column))
    else:
        widget.delete(0, tk.END)
        widget.insert(0, tree.set(item, column))
    widget.select_range(0, tk.END)
    widget.focus()
    widget.bind("<FocusOut>", lambda e: save_edit(e.widget, tree, item, column))
    widget.bind("<Return>", lambda e: save_edit(e.widget, tree, item, column))
    widget.place(x=cell_bbox[0], y=cell_bbox[1], width=cell_bbox[2], height=cell_bbox[3])

def save_edit(widget, tree, item, column):
    global data_changed
    if isinstance(widget, ttk.Combobox):
        value = widget.get()
    else:
        value = widget.get().strip()
    tree.set(item, column, value)
    widget.destroy()
    sort_treeview(tree)
    data_changed = True

def load_preloaded_data(tree, preloaded_data):
    global data_changed
    for data in preloaded_data:
        name, awareness, agility, init_bonus, rolled_init, init_total, hold_action, condition1, condition2, condition3, toughness, will, fort, dodge, parry, description = data
        
        # Calculate the total initiative
        total_init = init_bonus
        
        # Insert the data into the tree
        tag = 'evenrow' if len(tree.get_children()) % 2 == 0 else 'oddrow'
        tree.insert("", "end", values=(name, awareness, agility, init_bonus, rolled_init, total_init, hold_action, condition1, condition2, condition3, toughness, will, fort, dodge, parry, description), tags=(tag,))
    
    # Sort the treeview after loading all data
    sort_treeview(tree)
    data_changed = False

def toggle_window_lock(window, lock_var):
    window.attributes('-topmost', lock_var.get())

def update_init_total_on_edit(widget, tree, item, column):
    save_edit(widget, tree, item, column)
    init_bonus = safe_int(tree.set(item, "Init Bonus"))
    rolled_init = safe_int(tree.set(item, "Rolled Init"))
    init_total = init_bonus + rolled_init
    tree.set(item, "Init Total", str(init_total))
    sort_treeview(tree)

def safe_int(value):
    return int(value) if value.isdigit() else 0

if __name__ == "__main__":
    root = tk.Tk()
    root.withdraw()
    open_initiative_tracker(None, {})
import tkinter as tk
from tkinter import ttk
import random

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

def open_initiative_tracker():
    tracker_window = tk.Toplevel()
    tracker_window.title("Initiative Tracker")
    tracker_window.geometry("1400x600")

    # Frame for input fields
    input_frame = tk.Frame(tracker_window)
    input_frame.grid(row=0, column=0, padx=10, pady=10)

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
    add_button.grid(row=4, columnspan=2, pady=10)

    # Treeview for displaying initiative order
    columns = ("Name", "Awareness", "Agility", "Initiative", "Hold Action", "Condition 1", "Condition 2", "Condition 3", "Toughness", "Will", "Dead", "Description")
    global tree
    tree = ttk.Treeview(tracker_window, columns=columns, show="headings")
    for col in columns:
        tree.heading(col, text=col)
        tree.column(col, stretch=True)

    # Configure the description column to handle text wrapping
    tree.column("Description", width=500, stretch=True)

    tree.grid(row=1, column=0, padx=10, pady=10, sticky="nsew")

    tracker_window.grid_rowconfigure(1, weight=1)
    tracker_window.grid_columnconfigure(0, weight=1)

    # List of conditions
    conditions = [
        "Compelled", "Controlled", "Dazed", "Debilitated", "Defenseless", "Disabled",
        "Fatigued", "Hindered", "Immobile", "Impaired", "Normal", "Stunned", "Transformed",
        "Unaware", "Vulnerable", "Weakened", "Asleep", "Blind", "Bound", "Deaf", "Dying",
        "Entranced", "Exhausted", "Incapacitated", "Paralyzed", "Prone", "Restrained",
        "Staggered", "Surprised"
    ]

    conditions_dict = {
        "Compelled": "Limited to a single standard action each turn, chosen by another controlling character.",
        "Controlled": "No free will. Actions dictated by another controlling character.",
        "Dazed": "Single standard action per round. Stunned supersedes Dazed.",
        "Debilitated": "The character has one or more abilities lowered below -5.",
        "Defenseless": "Active Defense bonuses of 0. Attacks can make attacks as routine checks. If the attacker makes a normal attack, any hit is treated as a critical hit. Defenseless characters are often Prone.",
        "Disabled": "-5 circumstance penalty on checks. Debilitated (if it applies to the same traits) supersedes disabled.",
        "Fatigued": "Fatigued characters are hindered. Characters recover from Fatigue after an hour of rest.",
        "Hindered": "Moves at half normal speed (-1 speed rank). Immobile supersedes hindered.",
        "Immobile": "No movement speed and cannot move from the spot they occupy.",
        "Impaired": "-2 circumstance penalty on checks. Disabled (if it applies to the same traits) supersedes Impaired.",
        "Normal": "Unharmed and unaffected by other conditions.",
        "Stunned": "Cannot take any actions.",
        "Transformed": "Some or all traits altered.",
        "Unaware": "Unable to make interaction or Perception checks or perform any action based on them. Subjects have full concealment from all of a character's unaware senses.",
        "Vulnerable": "Half Active Defenses (rounding up). Defenseless supersedes vulnerable.",
        "Weakened": "Temporarily lost power points in a trait. Debilitated supersedes Weakened.",
        "Asleep": "Defenseless, Stunned, and Unaware. Hearing Perception check with three or more levels of success wakes the character.",
        "Blind": "Everything has full visual concealment. Hindered, visually Unaware, and Vulnerable.",
        "Bound": "Defenseless, Immobile, and Impaired.",
        "Deaf": "Everything has auditory concealment. Interaction limited to sign-language and lip-reading.",
        "Dying": "Incapacitated. When a character gained Dying, making a Fortitude check (DC15). If succeeds, nothing happens. If two degrees of success, the character stabilizes, removing this condition. If the check fails, the character remains Dying. Three or more total degrees of failure mean the character dies. Dying characters make a check each round until they stabilize or die.",
        "Entranced": "Stunned. Any obvious threat automatically breaks the trance. Allies can break with interaction skill check (DC10+Effect Rank)",
        "Exhausted": "Impaired and Hindered. Characters recover after an hour of rest in comfortable surroundings.",
        "Incapacitated": "Defenseless, Stunned, and Unaware. Usually fall prone, unless some outside force keeps them standing.",
        "Paralyzed": "Defenseless, Immobile, and physically Stunned, frozen in place and unable to move. Still aware and can take purely mental actions.",
        "Prone": "Lying on the ground, receiving a -5 circumstance penalty on close attack checks. Opponents receive a +5 circumstance bonus to close attack checks but a -5 penalty to ranged attacks. Prone characters are Hindered. Standing up is a Move action.",
        "Restrained": "Hindered and Vulnerable. If the restraints are anchored to an immobile object, the character is Immobile instead of Hindered.",
        "Staggered": "Dazed and Hindered.",
        "Surprised": "Stunned and Vulnerable, caught off-guard and unable to act."
    }

    def add_person():
        name = name_entry.get()
        awareness = int(awareness_entry.get())
        agility = int(agility_entry.get())
        initiative = int(initiative_entry.get())

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
            value = widget.get() if isinstance(widget, tk.Entry) else widget.get("1.0", "end").strip()
            widget.destroy()
            save_edit(item, column, value)

        if column_index in [4, 10]:  # Hold Action and Dead columns
            combobox = ttk.Combobox(tree, values=["True", "False"])
            combobox.set(tree.set(item, column))
            combobox.place(x=tree.bbox(item, column)[0], y=tree.bbox(item, column)[1], anchor="nw")
            combobox.bind("<<ComboboxSelected>>", focus_out)
        elif column_index in [5, 6, 7]:  # Condition columns
            combobox = ttk.Combobox(tree, values=conditions)
            combobox.set(tree.set(item, column))
            combobox.place(x=tree.bbox(item, column)[0], y=tree.bbox(item, column)[1], anchor="nw")
            combobox.bind("<<ComboboxSelected>>", focus_out)
        elif column_index == 11:  # Description column
            text_widget = WrappingText(tree, sort_treeview, wrap="word", height=10, width=50)
            text_widget.insert("1.0", tree.set(item, column))
            text_widget.place(x=tree.bbox(item, column)[0], y=tree.bbox(item, column)[1], anchor="nw")
            text_widget.bind("<FocusOut>", lambda e: text_widget.save_edit(item, column))
            text_widget.focus()
        else:  # Other columns
            entry = tk.Entry(tree)
            entry.insert(0, tree.set(item, column))
            entry.place(x=tree.bbox(item, column)[0], y=tree.bbox(item, column)[1], anchor="nw")
            entry.bind("<FocusOut>", focus_out)
            entry.focus()

    tree.bind("<Double-1>", edit_cell)

    def open_condition_lookup():
        condition_window = tk.Toplevel()
        condition_window.title("Conditions")
        condition_window.geometry("500x400")

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

    condition_button = tk.Button(tracker_window, text="Condition Lookup", command=open_condition_lookup)
    condition_button.grid(row=0, column=1, padx=10, pady=10, sticky="ne")

    dice_roller_button = tk.Button(tracker_window, text="Dice Roller", command=open_dice_roller)
    dice_roller_button.grid(row=1, column=1, padx=10, pady=10, sticky="ne")

    tracker_window.mainloop()

def open_dice_roller():
    dice_window = tk.Toplevel()
    dice_window.title("Dice Roller")
    dice_window.geometry("200x400")

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

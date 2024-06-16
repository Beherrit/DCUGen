import tkinter as tk
from tkinter import ttk
from dice_roller import open_dice_roller

def open_initiative_tracker():
    tracker_window = tk.Toplevel()
    tracker_window.title("Initiative Tracker")

    # Labels and Entries for Name, Awareness, Agility, Initiative
    name_label = tk.Label(tracker_window, text="Name:")
    name_label.grid(row=0, column=0, padx=5, pady=5)
    name_entry = tk.Entry(tracker_window)
    name_entry.grid(row=0, column=1, padx=5, pady=5)

    awareness_label = tk.Label(tracker_window, text="Awareness:")
    awareness_label.grid(row=1, column=0, padx=5, pady=5)
    awareness_entry = tk.Entry(tracker_window)
    awareness_entry.grid(row=1, column=1, padx=5, pady=5)

    agility_label = tk.Label(tracker_window, text="Agility:")
    agility_label.grid(row=2, column=0, padx=5, pady=5)
    agility_entry = tk.Entry(tracker_window)
    agility_entry.grid(row=2, column=1, padx=5, pady=5)

    initiative_label = tk.Label(tracker_window, text="Initiative:")
    initiative_label.grid(row=3, column=0, padx=5, pady=5)
    initiative_entry = tk.Entry(tracker_window)
    initiative_entry.grid(row=3, column=1, padx=5, pady=5)

    add_person_button = tk.Button(tracker_window, text="Add Person", command=lambda: add_person(tracker_window, name_entry.get(), awareness_entry.get(), agility_entry.get(), initiative_entry.get()))
    add_person_button.grid(row=4, column=0, columnspan=2, padx=5, pady=5)

    # Headers for the tracker table
    headers = ["Name", "Awareness", "Agility", "Initiative", "Condition", "Condition", "Condition", "Condition", "Toughness", "Will", "Dead", "Description"]
    for col_num, header in enumerate(headers):
        tk.Label(tracker_window, text=header).grid(row=5, column=col_num, padx=5, pady=5)

    # Add functionality to add people to the tracker
    tracker_data = []

    def add_person(window, name, awareness, agility, initiative):
        row_num = len(tracker_data) + 6
        tracker_data.append((name, awareness, agility, initiative))
        tk.Label(window, text=name).grid(row=row_num, column=0, padx=5, pady=5)
        tk.Label(window, text=awareness).grid(row=row_num, column=1, padx=5, pady=5)
        tk.Label(window, text=agility).grid(row=row_num, column=2, padx=5, pady=5)
        tk.Label(window, text=initiative).grid(row=row_num, column=3, padx=5, pady=5)

    # Condition Lookup Button
    condition_button = tk.Button(tracker_window, text="Condition Lookup", command=open_conditions_lookup)
    condition_button.grid(row=0, column=10, padx=5, pady=5, sticky="e")

    # Dice Roller Button
    dice_roller_button = tk.Button(tracker_window, text="Dice Roller", command=open_dice_roller)
    dice_roller_button.grid(row=1, column=10, padx=5, pady=5, sticky="e")

def open_conditions_lookup():
    conditions_window = tk.Toplevel()
    conditions_window.title("Conditions")

    conditions_text = tk.Text(conditions_window, wrap="word", width=80, height=20)
    conditions_text.pack(expand=True, fill='both')

    conditions = [
        ("Compelled", "Limited to a single standard action each turn, chosen by another controlling character. Controlled supersedes compelled."),
        ("Controlled", "No free will. Actions dictated by another controlling character."),
        ("Dazed", "Single standard action per round. Stunned supersedes Dazed."),
        ("Debilitated", "The character has one or more abilities lowered below -5."),
        ("Defenseless", "Active Defense bonuses of 0. Attacks can make attacks as routine checks. If the attacker makes a normal attack, any hit is treated as a critical hit. Defenseless characters are often Prone."),
        ("Disabled", "-5 circumstance penalty on checks. Debilitated (if it applies to the same traits) supersedes disabled."),
        ("Fatigued", "Fatigued characters are hindered. Characters recover from Fatigue after an hour of rest."),
        ("Hindered", "Moves at half normal speed (-1 speed rank). Immobile supersedes hindered."),
        ("Immobile", "No movement speed and cannot move from the spot they occupy."),
        ("Impaired", "-2 circumstance penalty on checks. Disabled (if it applies to the same traits) supersedes Impaired."),
        ("Normal", "Unharmed and unaffected by other conditions."),
        ("Stunned", "Cannot take any actions."),
        ("Transformed", "Some or all traits altered."),
        ("Unaware", "Unable to make interaction or Perception checks or perform any action based on them. Subjects have full concealment from all of a character's unaware senses."),
        ("Vulnerable", "Half Active Defenses (rounding up). Defenseless supersedes vulnerable."),
        ("Weakened", "Temporarily lost power points in a trait. Debilitated supersedes Weakened."),
        ("Asleep", "Defenseless, Stunned, and Unaware. Hearing Perception check with three or more levels of success wakes the character."),
        ("Blind", "Everything has full visual concealment. Hindered, visually Unaware, and Vulnerable."),
        ("Bound", "Defenseless, Immobile, and Impaired."),
        ("Deaf", "Everything has auditory concealment. Interaction limited to sign-language and lip-reading."),
        ("Dying", "Incapacitated. When a character gained Dying, making a Fortitude check (DC15). If succeeds, nothing happens. If two degrees of success, the character stabilizes, removing this condition. If the check fails, the character remains Dying. Three or more total degrees of failure mean the character dies. Dying characters make a check each round until they stabilize or die."),
        ("Entranced", "Stunned. Any obvious threat automatically breaks the trance. Allies can break with interaction skill check (DC10+Effect Rank)"),
        ("Exhausted", "Impaired and Hindered. Characters recover after an hour of rest in comfortable surroundings."),
        ("Incapacitated", "Defenseless, Stunned, and Unaware. Usually fall prone, unless some outside force keeps them standing."),
        ("Paralyzed", "Defenseless, Immobile, and physically Stunned, frozen in place and unable to move. Still aware and can take purely mental actions."),
        ("Prone", "Lying on the ground, receiving a -5 circumstance penalty on close attack checks. Opponents receive a +5 circumstance bonus to close attack checks but a -5 penalty to ranged attacks. Prone characters are Hindered. Standing up is a Move action."),
        ("Restrained", "Hindered and Vulnerable. If the restraints are anchored to an immobile object, the character is Immobile instead of Hindered."),
        ("Staggered", "Dazed and Hindered."),
        ("Surprised", "Stunned and Vulnerable, caught off-guard and unable to act."),
    ]

    for condition, description in conditions:
        conditions_text.insert("end", f"{condition}\n", "bold")
        conditions_text.insert("end", f"- {description}\n\n")

    conditions_text.tag_configure("bold", font=("Helvetica", 10, "bold"))
    conditions_text.config(state="disabled")  # Make the text widget read-only

    scrollbar = tk.Scrollbar(conditions_window, command=conditions_text.yview)
    conditions_text.config(yscrollcommand=scrollbar.set)
    scrollbar.pack(side="right", fill="y")

if __name__ == "__main__":
    root = tk.Tk()
    open_initiative_tracker()
    root.mainloop()

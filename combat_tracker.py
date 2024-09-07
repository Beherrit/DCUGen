import tkinter as tk
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from tooltip import ToolTip

def open_combat_calculator():
    calc_window = ttk.Toplevel()
    calc_window.title("Combat Calculator")
    calc_window.geometry("400x500")

    notebook = ttk.Notebook(calc_window)
    notebook.pack(expand=True, fill="both", padx=10, pady=10)

    # Dodge Frame
    dodge_frame = ttk.Frame(notebook, padding=10)
    notebook.add(dodge_frame, text="Dodge")

    ttk.Label(dodge_frame, text="Dodge Defense Number:").pack(pady=5)
    dodge_entry = ttk.Entry(dodge_frame)
    dodge_entry.pack(pady=5)
    ToolTip(dodge_entry, "Enter the target's Dodge defense value")

    ttk.Label(dodge_frame, text="Attacker's To Hit Roll:").pack(pady=5)
    dodge_hit_entry = ttk.Entry(dodge_frame)
    dodge_hit_entry.pack(pady=5)
    ToolTip(dodge_hit_entry, "Enter the attacker's total attack roll")

    ttk.Label(dodge_frame, text="Note: +10 is already included in the calculation").pack(pady=5)

    dodge_result_label = ttk.Label(dodge_frame, text="")
    dodge_result_label.pack(pady=10)

    def calculate_dodge_hit():
        dodge = dodge_entry.get()
        to_hit = dodge_hit_entry.get()

        dodge = int(dodge) + 10 if dodge else 10
        to_hit = int(to_hit) if to_hit else 0

        result = "HIT" if to_hit >= dodge else "MISS"
        dodge_result_label.config(text=f"Result: {result}")

    ttk.Button(dodge_frame, text="Calculate Hit", command=calculate_dodge_hit, style="info.TButton").pack(pady=10)

    # Additional Dodge Information
    dodge_info_text = (
        "Dodge Rules:\n"
        "- Dodge Already Includes +10\n"
        "- Dodge Defense = 10 + Dodge rank\n"
        "- Used against ranged and area attacks\n"
        "- Can be used as a reaction\n"
        "- Vulnerable targets have -5 to Dodge Defense\n"
        "- Defenseless targets have a Dodge Defense of 0\n"
        "- Perception attacks automatically hit\n"
        "- Area Attacks are Rolled to determine damage. Full or half.\n"
        "- Area attacks are 10 + Effect Rank to Dodge (Defense is Rolled)"
    )
    dodge_info_label = ttk.Label(dodge_frame, text=dodge_info_text, wraplength=350, justify="left")
    dodge_info_label.pack(pady=10)

    # Parry Frame
    parry_frame = ttk.Frame(notebook, padding=10)
    notebook.add(parry_frame, text="Parry")

    ttk.Label(parry_frame, text="Parry Defense Number:").pack(pady=5)
    parry_entry = ttk.Entry(parry_frame)
    parry_entry.pack(pady=5)
    ToolTip(parry_entry, "Enter the target's Parry defense value")

    ttk.Label(parry_frame, text="Attacker's To Hit Roll:").pack(pady=5)
    parry_hit_entry = ttk.Entry(parry_frame)
    parry_hit_entry.pack(pady=5)
    ToolTip(parry_hit_entry, "Enter the attacker's total attack roll")

    ttk.Label(parry_frame, text="Note: +10 is already included in the calculation").pack(pady=5)

    parry_result_label = ttk.Label(parry_frame, text="")
    parry_result_label.pack(pady=10)

    def calculate_parry_hit():
        parry = parry_entry.get()
        to_hit = parry_hit_entry.get()

        parry = int(parry) + 10 if parry else 10
        to_hit = int(to_hit) if to_hit else 0

        result = "HIT" if to_hit >= parry else "MISS"
        parry_result_label.config(text=f"Result: {result}")

    ttk.Button(parry_frame, text="Calculate Hit", command=calculate_parry_hit, style="info.TButton").pack(pady=10)

    # Additional Parry Information
    parry_info_text = (
        "Parry Rules:\n"
        "- Parry Already Includes +10\n"
        "- Parry Defense = 10 + Fighting rank\n"
        "- Used against close attacks\n"
        "- Can be used as a reaction\n"
        "- Vulnerable targets have -5 to Parry Defense\n"
        "- Defenseless targets have a Parry Defense of 0"
    )
    parry_info_label = ttk.Label(parry_frame, text=parry_info_text, wraplength=350, justify="left")
    parry_info_label.pack(pady=10)

    # Toughness Damage Frame
    toughness_frame = ttk.Frame(notebook, padding=10)
    notebook.add(toughness_frame, text="Toughness")

    ttk.Label(toughness_frame, text="Attacker's Damage Value:").pack(pady=5)
    damage_entry = ttk.Entry(toughness_frame)
    damage_entry.pack(pady=5)
    ToolTip(damage_entry, "Enter the total damage value of the attack")

    ttk.Label(toughness_frame, text="Defender's Toughness Roll:").pack(pady=5)
    defense_entry = ttk.Entry(toughness_frame)
    defense_entry.pack(pady=5)
    ToolTip(defense_entry, "Enter the defender's Toughness roll result")

    ttk.Label(toughness_frame, text="Note: +15 is already included in the calculation").pack(pady=5)

    toughness_result_label = ttk.Label(toughness_frame, text="")
    toughness_result_label.pack(pady=10)

    def calculate_toughness():
        damage_value = damage_entry.get()
        defense_roll = defense_entry.get()

        damage_value = int(damage_value) + 15 if damage_value else 15
        defense_roll = int(defense_roll) if defense_roll else 0

        excess = (damage_value - defense_roll) // 5
        penalty = -excess if excess > 0 else 0
        toughness_result_label.config(text=f"Penalty: {penalty}")

    ttk.Button(toughness_frame, text="Calculate Toughness", command=calculate_toughness, style="info.TButton").pack(pady=10)

    # Additional Toughness Information
    toughness_info_text = (
        "Toughness Rules:\n"
        "- Toughness Already Includes +15\n"
        "- Toughness = Stamina + Defensive Powers + 15\n"
        "- Used against damage effects\n"
        "- Failure by 5 or more = -1 penalty and Dazed\n"
        "- Failure by 10 or more = -2 penalty and Staggered\n"
        "- Failure by 15 or more = Incapacitated\n"
        "- Penalties are cumulative"
    )
    toughness_info_label = ttk.Label(toughness_frame, text=toughness_info_text, wraplength=350, justify="left")
    toughness_info_label.pack(pady=10)

    # Resistance Damage Frame
    resistance_frame = ttk.Frame(notebook, padding=10)
    notebook.add(resistance_frame, text="Resistance")

    ttk.Label(resistance_frame, text="Attacker's Effect Rank:").pack(pady=5)
    effect_rank_entry = ttk.Entry(resistance_frame)
    effect_rank_entry.pack(pady=5)
    ToolTip(effect_rank_entry, "Enter the rank of the effect being resisted")

    ttk.Label(resistance_frame, text="Defender's Resistance Value Rolled:").pack(pady=5)
    resistance_roll_entry = ttk.Entry(resistance_frame)
    resistance_roll_entry.pack(pady=5)
    ToolTip(resistance_roll_entry, "Enter the defender's resistance roll result")

    ttk.Label(resistance_frame, text="Note: +10 is already included in the calculation").pack(pady=5)

    resistance_result_label = ttk.Label(resistance_frame, text="")
    resistance_result_label.pack(pady=10)

    def calculate_resistance():
        effect_rank = effect_rank_entry.get()
        resistance_roll = resistance_roll_entry.get()

        effect_rank = int(effect_rank) + 10 if effect_rank else 10
        resistance_roll = int(resistance_roll) if resistance_roll else 0

        excess = (effect_rank - resistance_roll) // 5
        effect = -excess if excess > 0 else 0
        resistance_result_label.config(text=f"Effect: {effect}")

    ttk.Button(resistance_frame, text="Calculate Resistance", command=calculate_resistance, style="info.TButton").pack(pady=10)

    # Additional Resistance Information
    resistance_info_text = (
        "Resistance Rules:\n"
        "- Resistance Already Includes +10\n"
        "- Resistance check = d20 + ability rank + 10\n"
        "- Used against non-damage effects\n"
        "- Failure by 5 or more = -1 penalty and Dazed\n"
        "- Failure by 10 or more = -2 penalty and Staggered\n"
        "- Failure by 15 or more = Incapacitated\n"
        "- Penalties are cumulative"
    )
    resistance_info_label = ttk.Label(resistance_frame, text=resistance_info_text, wraplength=350, justify="left")
    resistance_info_label.pack(pady=10)

    # Healing Frame
    healing_frame = ttk.Frame(notebook, padding=10)
    notebook.add(healing_frame, text="Healing")

    ttk.Label(healing_frame, text="Healer's Roll:").pack(pady=5)
    healing_roll_entry = ttk.Entry(healing_frame)
    healing_roll_entry.pack(pady=5)
    ToolTip(healing_roll_entry, "Enter the healer's total Healing check result")

    healing_result_label = ttk.Label(healing_frame, text="")
    healing_result_label.pack(pady=10)

    def calculate_healing():
        healing_roll = healing_roll_entry.get()
        healing_roll = int(healing_roll) if healing_roll else 0

        if healing_roll < 10:
            result = "Healing failed"
        else:
            successes = 1 + (healing_roll - 10) // 5
            result = f"Healed {successes} Damage condition{'s' if successes > 1 else ''}"
            if healing_roll >= 20:
                result += "\nCan stabilize a dying subject"

        healing_result_label.config(text=result)

    ttk.Button(healing_frame, text="Calculate Healing", command=calculate_healing, style="info.TButton").pack(pady=10)

    # Additional Healing Information
    info_text = (
        "Healing Rules:\n"
        "- Requires a standard action. Can only be used once per round.\n"
        "- DC 10 to succeed, +1 success per 5 points above\n"
        "- Each success heals one Damage condition\n"
        "- Heals worst conditions first\n"
        "- Can stabilize a dying subject\n"
        "- Grants bonus equal to Healing rank on resistance checks against disease/poison\n"
        "- Can be used on self if able to take a standard action\n"
        "- Doesn't work on subjects unable to recover on their own"
    )
    info_label = ttk.Label(healing_frame, text=info_text, wraplength=350, justify="left")
    info_label.pack(pady=10)

    # Data Frame
    data_frame = ttk.Frame(notebook, padding=10)
    notebook.add(data_frame, text="Data")

    info_text = (
        "DAMAGE RESISTANCE CHECK\n\n"
        "Toughness vs. [Damage rank + 15]\n\n"
        "Success: The damage has no effect.\n\n"
        "Failure (one degree): The target has a –1 circumstance "
        "penalty to further resistance checks against damage.\n\n"
        "Failure (two degrees): The target is dazed until the end "
        "of their next turn and has a –1 circumstance penalty to "
        "further checks against damage.\n\n"
        "Failure (three degrees): The target is staggered and "
        "has a –1 circumstance penalty to further checks against "
        "damage. If the target is staggered again (three degrees of "
        "failure on a Damage resistance check), apply the fourth "
        "degree of effect. The staggered condition remains until "
        "the target recovers (see Recovery, following).\n\n"
        "Failure (four degrees): The target is incapacitated until "
        "able to recover (see Recovery, following)."
    )
    
    data_text = tk.Text(data_frame, wrap=tk.WORD, width=50, height=25)
    data_text.insert(tk.END, info_text)
    data_text.config(state=tk.DISABLED)  # Make the text read-only
    data_text.pack(expand=True, fill="both")

    # Add a scrollbar to the text widget
    scrollbar = ttk.Scrollbar(data_frame, orient="vertical", command=data_text.yview)
    scrollbar.pack(side="right", fill="y")
    data_text.configure(yscrollcommand=scrollbar.set)

if __name__ == "__main__":
    root = tk.Tk()
    root.withdraw()
    open_combat_calculator()
    root.mainloop()

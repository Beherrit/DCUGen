import tkinter as tk
from tkinter import ttk, messagebox
import random
from DCUQA import generate_character, pretty_print_character, load_archetypes, update_color_scheme
from utils import *

def create_archetype_dropdown(filters_window, archetype_var, archetypes):
    archetype_label = ttk.Label(filters_window, text="Select Archetype:")
    archetype_label.grid(row=2, column=0, padx=5, pady=5, sticky="w")

    # Ensure "Default" is added only once
    options = ["Default"] + list(archetypes['archetypes'].keys())
    archetype_dropdown = ttk.OptionMenu(filters_window, archetype_var, *options)
    archetype_dropdown.config(width=20)  # Set a fixed width for the dropdown
    archetype_dropdown.grid(row=2, column=1, padx=5, pady=5, sticky="ew")
    return archetype_dropdown

def create_team_dropdown(filters_window, team_var, archetypes):
    team_label = ttk.Label(filters_window, text="Select Team:")
    team_label.grid(row=3, column=0, padx=5, pady=5, sticky="w")

    team_dropdown = ttk.OptionMenu(filters_window, team_var, "Select Team", *archetypes['teams'].keys())
    team_dropdown.config(width=20)  # Set a fixed width for the dropdown
    team_dropdown.grid(row=3, column=1, padx=5, pady=5, sticky="ew")
    return team_dropdown

def create_percent_entry(filters_window, label_text, row, default_value):
    label = ttk.Label(filters_window, text=label_text)
    label.grid(row=row, column=0, padx=5, pady=5)
    entry = ttk.Entry(filters_window)
    entry.grid(row=row, column=1, padx=5, pady=5)
    entry.insert(0, default_value)
    return entry

def create_checkbox(filters_window, text, row, columnspan=2, initial_value=False):
    var = tk.BooleanVar(value=initial_value)
    checkbox = ttk.Checkbutton(filters_window, text=text, variable=var)
    checkbox.grid(row=row, column=0, padx=5, pady=5, columnspan=columnspan)
    return var

def create_power_type_entries(filters_window):
    power_type_frame = ttk.LabelFrame(filters_window, text="Power Types")
    power_type_frame.grid(row=11, column=0, columnspan=2, padx=5, pady=5)
    
    power_type_entries = []
    power_types = [
        ("Combat", "Melee"),
        ("Combat", "Ranged"),
        ("Utility", None),
        ("Support", None),
        ("Movement", None),
        ("Defensive", None)
    ]
    
    for power_type, power_range in power_types:
        frame = ttk.Frame(power_type_frame)
        frame.pack(fill="x", padx=5, pady=2)
        
        label = ttk.Label(frame, text=f"{power_type} ({power_range if power_range else 'Any'})")
        label.pack(side="left")
        
        entry = ttk.Entry(frame)
        entry.pack(side="right")
        entry.insert(0, "1")  # Default value for power types
        power_type_entries.append(entry)
    
    return power_type_entries, power_types

def update_fields_for_archetype(archetype_var, archetypes, stat_percent_entry, advantage_percent_entry, skill_percent_entry, defense_percent_entry, power_percent_entry, max_advantages_entry, max_powers_entry, power_type_entries):
    selected_archetype = archetype_var.get()

    # Check if the selected archetype exists in the JSON
    if selected_archetype in archetypes['archetypes']:
        archetype_data = archetypes['archetypes'][selected_archetype]
        stat_percent_entry.delete(0, 'end')
        stat_percent_entry.insert(0, archetype_data['stat_percent'])
        advantage_percent_entry.delete(0, 'end')
        advantage_percent_entry.insert(0, archetype_data['advantage_percent'])
        skill_percent_entry.delete(0, 'end')
        skill_percent_entry.insert(0, archetype_data['skill_percent'])
        defense_percent_entry.delete(0, 'end')
        defense_percent_entry.insert(0, archetype_data['defense_percent'])
        power_percent_entry.delete(0, 'end')
        power_percent_entry.insert(0, archetype_data['power_percent'])
        max_advantages_entry.delete(0, 'end')
        max_advantages_entry.insert(0, archetype_data['max_advantages'])
        max_powers_entry.delete(0, 'end')
        max_powers_entry.insert(0, archetype_data['max_powers'])

        for i, (power_type, power_data) in enumerate(archetype_data['power_types'].items()):
            if power_type == "Combat" and isinstance(power_data, dict):
                melee_value = power_data.get("Melee", 0)
                ranged_value = power_data.get("Ranged", 0)
                power_type_entries[i].delete(0, 'end')
                power_type_entries[i].insert(0, melee_value)
                power_type_entries[i + 1].delete(0, 'end')
                power_type_entries[i + 1].insert(0, ranged_value)
            else:
                power_type_entries[i].delete(0, 'end')
                power_type_entries[i].insert(0, power_data)

def on_generate_character_filters(
    archetype_var, archetypes, pl_entry, exclude_powers, villain_var,
    stat_percent_entry, advantage_percent_entry, skill_percent_entry,
    defense_percent_entry, power_percent_entry, max_advantages_entry,
    max_powers_entry, power_type_entries, power_types, notebook,
    text_widgets, characters, dark_mode, logger
):
    try:
        power_level = int(pl_entry.get())
        if power_level < 1 or power_level > 20:
            raise ValueError

        include_powers_value = not exclude_powers.get()
        villain_value = villain_var.get()

        selected_archetype = archetype_var.get()
        if selected_archetype in archetypes['archetypes']:
            archetype_data = archetypes['archetypes'][selected_archetype]
            stat_percent = archetype_data['stat_percent']
            advantage_percent = archetype_data['advantage_percent']
            skill_percent = archetype_data['skill_percent']
            defense_percent = archetype_data['defense_percent']
            power_percent = archetype_data['power_percent']
            max_advantages = archetype_data['max_advantages']
            max_powers = archetype_data['max_powers']
            selected_power_types = []

            if include_powers_value:
                for power_type, power_data in archetype_data['power_types'].items():
                    if power_type == "Combat" and isinstance(power_data, dict):
                        melee_value = power_data.get("Melee", 0)
                        ranged_value = power_data.get("Ranged", 0)
                        selected_power_types.append(("Combat", "Melee", melee_value))
                        selected_power_types.append(("Combat", "Ranged", ranged_value))
                    else:
                        selected_power_types.append((power_type, None, power_data))
            else:
                power_percent = 0  # Set power percent to 0 if powers are excluded

                # Redistribute power percentage to other categories
                total_other_percent = stat_percent + advantage_percent + skill_percent + defense_percent
                if total_other_percent > 0:
                    redistribution_ratio = 100 / total_other_percent
                    stat_percent *= redistribution_ratio
                    advantage_percent *= redistribution_ratio
                    skill_percent *= redistribution_ratio
                    defense_percent *= redistribution_ratio

        else:
            # If no archetype is selected, use manual inputs
            stat_percent = float(stat_percent_entry.get())
            advantage_percent = float(advantage_percent_entry.get())
            skill_percent = float(skill_percent_entry.get())
            defense_percent = float(defense_percent_entry.get())
            power_percent = float(power_percent_entry.get())
            max_advantages = int(max_advantages_entry.get())
            max_powers = int(max_powers_entry.get())
            selected_power_types = []

            if not include_powers_value:
                power_percent = 0  # Set power percent to 0 if powers are excluded

                # Redistribute power percentage to other categories
                total_other_percent = stat_percent + advantage_percent + skill_percent + defense_percent
                if total_other_percent > 0:
                    redistribution_ratio = 100 / total_other_percent
                    stat_percent *= redistribution_ratio
                    advantage_percent *= redistribution_ratio
                    skill_percent *= redistribution_ratio
                    defense_percent *= redistribution_ratio

            for i, entry in enumerate(power_type_entries):
                power_type = power_types[i][0]
                power_range = power_types[i][1]
                entry_value = int(entry.get())
                selected_power_types.append((power_type, power_range, entry_value))

        logger.debug(f"Selected Power Types: {selected_power_types}")

        # Adjust the character generation to ensure correct point spending
        character = generate_character(
            power_level,
            include_powers_value,
            stat_percent,
            advantage_percent,
            skill_percent,
            defense_percent,
            power_percent,
            max_advantages,
            max_powers,
            selected_power_types,
            villain=villain_value  # Pass the villain flag
        )

        # Create a new tab with the character's name
        character_name = character.get('name', 'Unnamed Character')
        new_tab = ttk.Frame(notebook)
        notebook.add(new_tab, text=character_name)
        
        # Create a new text widget in the new tab
        new_character_summary_text = tk.Text(new_tab, height=15, width=50)
        new_character_summary_text.pack(expand=True, fill='both')
        new_character_summary_text.tag_configure("bold", font=("Helvetica", 12, "bold", "underline"))
        new_character_summary_text.tag_configure("bold_no_underline", font=("Helvetica", 10, "bold"))
        new_character_summary_text.tag_configure("normal_format", font=("Helvetica", 10))
        
        # Display the character information in the new text widget
        pretty_print_character(character, new_character_summary_text)
        text_widgets[new_tab] = new_character_summary_text
        characters[character_name] = character  # Store the character in the dictionary
        # Switch to the new tab
        notebook.select(new_tab)
        colors = dark_mode_colors if dark_mode else light_mode_colors
        apply_color_scheme_to_tab(new_tab, colors)

    except ValueError:
        messagebox.showerror("Invalid Input", "Please ensure all inputs are valid.")
        return

def generate_team(
    archetypes, team_var, team_size_entry, archetype_var, pl_entry, exclude_powers, villain_var,
    stat_percent_entry, advantage_percent_entry, skill_percent_entry,
    defense_percent_entry, power_percent_entry, max_advantages_entry,
    max_powers_entry, power_type_entries, power_types, notebook,
    text_widgets, characters, dark_mode, logger
):
    selected_team = team_var.get()
    # Store the current selected archetype to restore it later
    current_archetype = archetype_var.get()

    if selected_team in archetypes['teams']:
        # Get the team size from user input
        try:
            team_size = int(team_size_entry.get())
            if team_size < 2 or team_size > 4:
                raise ValueError("Team size must be between 2 and 4.")
        except ValueError as e:
            messagebox.showerror("Invalid Team Size", str(e))
            return

        # Randomly select the desired number of archetypes
        team_archetypes = random.sample(archetypes['teams'][selected_team], team_size)
        for archetype_name in team_archetypes:
            # Set the current archetype to generate character based on it
            archetype_var.set(archetype_name)
            update_fields_for_archetype(
                archetype_var, archetypes, stat_percent_entry, advantage_percent_entry, 
                skill_percent_entry, defense_percent_entry, power_percent_entry, 
                max_advantages_entry, max_powers_entry, power_type_entries
            )
            on_generate_character_filters(
                archetype_var, archetypes, pl_entry, exclude_powers, villain_var,
                stat_percent_entry, advantage_percent_entry, skill_percent_entry,
                defense_percent_entry, power_percent_entry, max_advantages_entry,
                max_powers_entry, power_type_entries, power_types, notebook, text_widgets,
                characters, dark_mode, logger
            )

    # Restore the original archetype selection after team generation
    archetype_var.set(current_archetype)
    update_fields_for_archetype(
        archetype_var, archetypes, stat_percent_entry, advantage_percent_entry, 
        skill_percent_entry, defense_percent_entry, power_percent_entry, 
        max_advantages_entry, max_powers_entry, power_type_entries
    )

def generate_random_percentages(stat_percent_entry, advantage_percent_entry, skill_percent_entry, defense_percent_entry, power_percent_entry, max_advantages_entry, max_powers_entry):
    stat_percent_entry.delete(0, 'end')
    advantage_percent_entry.delete(0, 'end')
    skill_percent_entry.delete(0, 'end')
    defense_percent_entry.delete(0, 'end')
    power_percent_entry.delete(0, 'end')

    percentages = [random.uniform(0, 100) for _ in range(5)]
    total = sum(percentages)
    normalized_percentages = [round(p / total * 100, 2) for p in percentages]

    stat_percent_entry.insert(0, normalized_percentages[0])
    advantage_percent_entry.insert(0, normalized_percentages[1])
    skill_percent_entry.insert(0, normalized_percentages[2])
    defense_percent_entry.insert(0, normalized_percentages[3])
    power_percent_entry.insert(0, normalized_percentages[4])

    max_advantages_entry.delete(0, 'end')
    max_powers_entry.delete(0, 'end')

    max_advantages_entry.insert(0, random.randint(0, 15))
    max_powers_entry.insert(0, random.randint(0, 8))

def open_character_filters_window(root, notebook, text_widgets, characters, dark_mode, logger):
    archetypes = load_archetypes()
    archetype_var = tk.StringVar()
    team_var = tk.StringVar()

    filters_window = tk.Toplevel(root)
    filters_window.title("Generate Character Filters")

    pl_label = ttk.Label(filters_window, text="Power Level:")
    pl_label.grid(row=0, column=0, padx=5, pady=5)
    pl_entry = ttk.Entry(filters_window)
    pl_entry.grid(row=0, column=1, padx=5, pady=5)
    pl_entry.insert(0, "10")

    exclude_powers = create_checkbox(filters_window, "Exclude Powers", row=1, columnspan=1)
    villain_var = create_checkbox(filters_window, "Villain", row=1, columnspan=4, initial_value=False)

    create_archetype_dropdown(filters_window, archetype_var, archetypes)
    create_team_dropdown(filters_window, team_var, archetypes)

    # Add Team Size Input
    team_size_label = ttk.Label(filters_window, text="Team Size (2-4):")
    team_size_label.grid(row=4, column=0, padx=5, pady=5)
    team_size_entry = ttk.Entry(filters_window)
    team_size_entry.grid(row=4, column=1, padx=5, pady=5)
    team_size_entry.insert(0, "4")

    stat_percent_entry = create_percent_entry(filters_window, "Stats Percent:", row=5, default_value="20")
    advantage_percent_entry = create_percent_entry(filters_window, "Advantages Percent:", row=6, default_value="20")
    skill_percent_entry = create_percent_entry(filters_window, "Skills Percent:", row=7, default_value="20")
    defense_percent_entry = create_percent_entry(filters_window, "Defenses Percent:", row=8, default_value="20")
    power_percent_entry = create_percent_entry(filters_window, "Powers Percent:", row=9, default_value="20")
    max_advantages_entry = create_percent_entry(filters_window, "Max Advantages:", row=10, default_value="20")
    max_powers_entry = create_percent_entry(filters_window, "Max Powers:", row=11, default_value="20")

    power_type_entries, power_types = create_power_type_entries(filters_window)

    generate_character_button = ttk.Button(
        filters_window, text="Generate Character Now",
        command=lambda: on_generate_character_filters(
            archetype_var, archetypes, pl_entry, exclude_powers, villain_var,
            stat_percent_entry, advantage_percent_entry, skill_percent_entry,
            defense_percent_entry, power_percent_entry, max_advantages_entry,
            max_powers_entry, power_type_entries, power_types, notebook, text_widgets,
            characters, dark_mode, logger)
    )
    generate_character_button.grid(row=13, column=0, columnspan=2, padx=5, pady=5)

    generate_team_button = ttk.Button(
        filters_window,
        text="Generate Team",
        command=lambda: generate_team(
            archetypes,
            team_var,
            team_size_entry,  # Pass the team size entry
            archetype_var,
            pl_entry,
            exclude_powers,
            villain_var,
            stat_percent_entry,
            advantage_percent_entry,
            skill_percent_entry,
            defense_percent_entry,
            power_percent_entry,
            max_advantages_entry,
            max_powers_entry,
            power_type_entries,
            power_types,
            notebook,
            text_widgets,
            characters,
            dark_mode,
            logger
        )
    )

    generate_team_button.grid(row=14, column=0, columnspan=2, padx=5, pady=5)

    random_percent_button = ttk.Button(
        filters_window, text="Random Percentages",
        command=lambda: generate_random_percentages(
            stat_percent_entry, advantage_percent_entry, skill_percent_entry,
            defense_percent_entry, power_percent_entry, max_advantages_entry, max_powers_entry
        )
    )
    random_percent_button.grid(row=15, column=0, columnspan=2, padx=5, pady=5)

    # Link the archetype selection to update the fields
    archetype_var.trace('w', lambda *args: update_fields_for_archetype(
        archetype_var, archetypes, stat_percent_entry, advantage_percent_entry,
        skill_percent_entry, defense_percent_entry, power_percent_entry,
        max_advantages_entry, max_powers_entry, power_type_entries
    ))
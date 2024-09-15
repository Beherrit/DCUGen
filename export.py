# export.py
import os
import tkinter as tk
from tkinter import filedialog, messagebox
from openpyxl import load_workbook
from openpyxl.styles import Font
from utils import *

def on_export_character_sheet_click(notebook, characters, text_widgets):
    # Get the name of the currently selected tab
    current_tab = notebook.tab(notebook.select(), "text")
    
    # Retrieve the character associated with the current tab
    character = characters.get(current_tab)
    
    if not character:
        return

    # Retrieve origin details from character
    origin_region = character['origin']['region']
    origin_country = character['origin']['country']
    origin_language = character['origin']['language']
    # Retrieve equipment from character
    equipment = character.get('equipment', [])
    # Retrieve languages from character and format them
    languages = character['languages']  # Assuming this is a list of language names
    formatted_languages = ", ".join(languages)
    # Check if a character has been generated
    selected_tab = notebook.nametowidget(notebook.select())
    text_widget = text_widgets.get(selected_tab)
    if not text_widget or not text_widget.get("1.0", tk.END).strip():
        return
    
    # Open the existing character sheet
    wb = load_workbook(filename='./json/CharacterName.xlsx')
    sheet = wb.active

    default_font = Font(size=8)
    for row in sheet.iter_rows():
        for cell in row:
            cell.font = default_font

    # Update the cells with data from the character summary
    sheet['K2'] = character['name']
    sheet['AP2'] = character['gender']
    sheet['BD2'] = character['age']
    sheet['W33'] = character['power_level']
    sheet['AD26'] = f"{character['theme']}" 
    sheet['R38'] = formatted_languages
    sheet['G93'] = f"{origin_region} | {origin_country} | {origin_language}"
    sheet['BE5'] = character['physical_traits']['height']
    sheet['BE8'] = character['physical_traits']['weight']
    sheet['AP5'] = character['physical_traits']['eye_color']
    sheet['AP8'] = character['physical_traits']['hair_color'] 
    sheet['N18'] = character['stats'].get('Strength', {}).get('value', '')
    sheet['N26'] = character['stats'].get('Agility', {}).get('value', '')
    sheet['N34'] = character['stats'].get('Fighting', {}).get('value', '')
    sheet['N42'] = character['stats'].get('Awareness', {}).get('value', '')   
    sheet['N22'] = character['stats'].get('Stamina', {}).get('value', '')       
    sheet['N30'] = character['stats'].get('Dexterity', {}).get('value', '')
    sheet['N38'] = character['stats'].get('Intellect', {}).get('value', '')
    sheet['N46'] = character['stats'].get('Presence', {}).get('value', '')
    sheet['Z18'] = character['defenses'].get('Dodge', {}).get('total_rank', '')
    sheet['Z24'] = character['defenses'].get('Parry', {}).get('total_rank', '')
    sheet['Z21'] = character['defenses'].get('Fortitude', {}).get('total_rank', '')
    sheet['Z30'] = character['defenses'].get('Toughness', {}).get('total_rank', '')
    sheet['Z27'] = character['defenses'].get('Will', {}).get('total_rank', '')
    sheet['AK18'] = character['initiative']
    sheet['AD33'] = f"{int(character['total_cost'])}"  # Updated to show total points spent

    # Compile personality traits
    positive_traits = " | ".join(character['personality_traits']['positive_traits'])
    negative_traits = " | ".join(character['personality_traits']['negative_traits'])
    quirky_traits = " | ".join(character['personality_traits']['quirky_traits'])
    all_traits = f"Personality: {positive_traits} | {negative_traits} | {quirky_traits}"

    # Assign traits to cell K11
    sheet['AK90'] = all_traits

    # Calculate attack bonuses
    melee_attack_bonus, ranged_attack_bonus = calculate_attack_bonuses(character)

    # Write Melee and Ranged Attack Bonuses
    sheet['AN20'] = "Melee Attack Bonus"
    sheet['BB20'] = melee_attack_bonus  # This cell for the bonus total only

    sheet['AN36'] = "Ranged Attack Bonus"
    sheet['BB36'] = ranged_attack_bonus  # This cell for the bonus total only

    melee_row = 22
    ranged_row = 38

    for power in character["powers"]:
        # Calculate accuracy for each power
        accuracy = calculate_accuracy(character, power)  # Ensure this function is defined and working correctly

        power_details = f"{power['name']}"
        if 'resisted' in power:
            power_details += f", Res: {power['resisted']}"

        if power["range"] == "Melee" and melee_row <= 34:
            if 'close_range' in power:
                power_details += f" | {power['close_range']},{power['medium_range']},{power['long_range']}"
            sheet[f'AN{melee_row}'] = power_details
            sheet[f'BF{melee_row}'] = power['rank']
            sheet[f'BB{melee_row}'] = accuracy
            melee_row += 2  # Increment to move to the next cell for the next melee power

        elif power["range"] == "Ranged" and ranged_row <= 50:
            if 'close_range' in power:
                power_details += f" | {power['close_range']},{power['medium_range']},{power['long_range']}"
            sheet[f'AN{ranged_row}'] = power_details
            sheet[f'BF{ranged_row}'] = power['rank']
            sheet[f'BB{ranged_row}'] = accuracy
            ranged_row += 2  # Increment to move to the next cell for the next ranged power

    # Write the sum to the merged cell N12-O12
    total_advantage_cost = sum(advantage['cost'] for advantage in character['advantages'])
    sheet['AQ14'] = total_advantage_cost

    # Load advantages data including descriptions
    advantages_data = load_data_from_json('./json/advantages.json')
    advantage_descriptions = {adv['name']: adv['description'] for adv in advantages_data}

    # Prepare cell mappings for names, ranks, and descriptions
    advantage_name_cells = [f'X{i}' for i in range(104, 142, 2)]
    advantage_rank_cells = [f'AE{i}' for i in range(104, 142, 2)]
    advantage_description_cells = [f'AG{i}' for i in range(104, 142, 2)]

    # Write advantage data to Excel
    for advantage, name_cell, rank_cell, desc_cell in zip(character['advantages'], advantage_name_cells, advantage_rank_cells, advantage_description_cells):
        try:
            sheet[name_cell] = advantage['name']
            sheet[rank_cell] = advantage['rank']
            sheet[desc_cell] = advantage_descriptions.get(advantage['name'], "No description available.")
        except KeyError as e:
            print(f"Error writing advantage data for {advantage['name']}: {str(e)}")

    # Add Skills
    skills = load_data_from_json('./json/skills.json')
    skill_rank_cells = {
        "Acrobatics": "P104",
        "Athletics": "P106",
        "Melee H2H": "P108",
        "Close Combat": "P110",  # Assuming all Melee entries are under this, further differentiation needed if not
        "Deception": "P118",
        "Expertise": "P120",  # Assuming multiple Expertise entries map to different rows
        "Insight": "P130",
        "Intimidation": "P132",
        "Investigation": "P134",
        "Perception": "P136",
        "Persuasion": "P138",
        "Ranged Combat": "P140",
        "Stealth": "P150",
        "Technology": "P152",
        "Treatment": "P154",
        "Vehicles": "P156",
        "Sleight of Hand": "P148"
    }
    skill_total_cells = {key: 'S' + value[1:] for key, value in skill_rank_cells.items()}  # Mapping rank cells to total cells

    total_skills_cost = 0
    for skill_template in skills:
        skill_name = skill_template['name']
        if skill_name in skill_rank_cells:
            try:
                # Get the skill from the character if it exists, otherwise use a default of 0 for rank
                skill = next((s for s in character['skills'] if s['name'] == skill_name), {'rank': 0})
                stat_bonus = sum(character['stats'][tag]['value'] for tag in skill_template['tags'])  # Calculate stat bonus
                rank = skill['rank']
                total_bonus = rank + stat_bonus  # Calculate total

                # Write rank and total to the specified cells
                sheet[skill_rank_cells[skill_name]] = rank
                sheet[skill_total_cells[skill_name]] = total_bonus

                # Sum up costs for the total skills cost
                total_skills_cost += skill_template.get('cost', 0) * rank  # Assuming cost per rank
            except AttributeError:
                print(f"Error writing skill data for {skill_name}. Skipping.")
        else:
            print(f"Skill {skill_name} not found in the cell mapping. Skipping.")

    # Directly calculate and write the total skills cost to the Excel cell
    total_skills_cost = sum(skill['cost'] for skill in character['skills'])
    sheet['BF14'] = total_skills_cost

    # Write Motivation
    motivation_name = character['Motivation']['name']
    motivation_description = character['Motivation']['description']
    sheet['F88'] = f"{motivation_name}: {motivation_description}"

    # Write Complications
    complication_cells = ['F90', 'AK88']
    for comp, cell in zip(character["Complications"], complication_cells):
        comp_name = comp['name']
        comp_description = comp['description']
        sheet[cell] = f"{comp_name}: {comp_description}"

    # Concatenate equipment details
    equipment_details = ""
    for item in equipment:
        item_name = item.get('name', 'Unknown')
        rank = item.get('rank', 'Unknown')
        cost = item.get('cost', 'Unknown')
        effect = item.get('effect', '')

        # Format effect
        effect_str = f"Effect: {effect}" if effect else ''

        # Concatenate item details
        item_details = f"{item_name} | Rank: {rank} | Cost: {cost} | {effect_str}\n"
        equipment_details += f"{item_details}"

    # Write equipment details to cell AI55
    sheet['AI55'] = equipment_details.strip()

    # Writing power details to the Excel sheet
    power_cells = [f'B{i}' for i in range(54, 84, 3)]  # Adjust the range as needed for more powers
    total_cost_cells = [f'AE{i}' for i in range(54, 84, 3)]
        
    for power, cell, total_cost_cell in zip(character['powers'], power_cells, total_cost_cells):
        # Simplify the construction of power details string
        power_details = f"{power['name']} | Rank: {power['rank']} | "
        extras_details = ', '.join([f"{extra} ({rank})" for extra, rank in zip(power['extras'], power['extras_ranks'])]) if 'extras' in power else ""
        flaws_details = ', '.join([f"{flaw} ({rank})" for flaw, rank in zip(power['flaws'], power['flaws_ranks'])]) if 'flaws' in power else ""

        # Append failure effects if the power is "Affliction" or "Ranged Affliction"
        if power['name'] in ["Affliction", "Ranged Affliction"] and 'failure_effects' in power:
            effects_text = " | ".join([effect for _, effect in power['failure_effects'].items()])
            power_details += f"Effects: {effects_text} | "

        # Combine details with extras and flaws
        power_full_details = f"{power_details}Extras: {extras_details} | Flaws: {flaws_details} |"

        # Write to Excel
        sheet[cell] = power_full_details.strip()

        # Optionally, you might want to adjust how total costs are handled if they are still required:
        # sheet[total_cost_cell] = power['cost']  # Write the individual power's total cost to its respective cell if necessary

        sheet[total_cost_cell] = power['cost']  # Write the individual power's total cost to its respective cell

    # Directly calculate and write the total powers cost to the Excel cell
    total_powers_cost = sum(power['cost'] for power in character['powers'])
    sheet['AB14'] = total_powers_cost

    # Calculate and write the total abilities and defenses cost to the Excel cell
    total_abilities_cost = sum(details['cost'] for details in character['stats'].values())  # Define total_abilities_cost
    total_defense_cost = sum(details['bought_rank'] for details in character['defenses'].values() if isinstance(details, dict))
    total_abilities_and_defenses_cost = total_abilities_cost + total_defense_cost
    sheet['M14'] = total_abilities_and_defenses_cost
    
    # Ask the user for a filename and save the updated character sheet
    filename = filedialog.asksaveasfilename(
        defaultextension=".xlsx",
        filetypes=[("Excel files", "*.xlsx")],
        initialdir=os.path.expanduser("~/Desktop")
    )
    if filename:
        wb.save(filename)
        messagebox.showinfo("Export to Character Sheet", f"Character sheet exported to {filename}")

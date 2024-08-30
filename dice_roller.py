import tkinter as tk
from tkinter import ttk
import random

class DiceRoller:
    def __init__(self, master):
        self.master = master
        self.dice_counts = {2: 0, 3: 0, 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0}
        self.create_widgets()

    def create_widgets(self):
        # Custom Roll Frame
        custom_frame = ttk.Frame(self.master)
        custom_frame.pack(pady=10)

        ttk.Label(custom_frame, text="Custom Roll:").grid(row=0, column=0, padx=5)
        self.min_val = ttk.Entry(custom_frame, width=5)
        self.min_val.grid(row=0, column=1, padx=5)
        ttk.Label(custom_frame, text="to").grid(row=0, column=2, padx=5)
        self.max_val = ttk.Entry(custom_frame, width=5)
        self.max_val.grid(row=0, column=3, padx=5)

        # Standard Dice Buttons
        dice_frame = ttk.Frame(self.master)
        dice_frame.pack(pady=10)

        dice = [2, 3, 4, 6, 8, 10, 12, 20, 100]
        self.dice_buttons = {}
        for i, sides in enumerate(dice):
            button = ttk.Button(dice_frame, text=f"D{sides} (0)", command=lambda s=sides: self.increment_dice(s))
            button.grid(row=i//3, column=i%3, padx=5, pady=5)
            self.dice_buttons[sides] = button

        # Roll Dice Button
        ttk.Button(self.master, text="Roll Dice", command=self.roll_all_dice).pack(pady=10)

        # Result Display
        self.result_var = tk.StringVar()
        self.result_var.set("Click on dice to add, then Roll Dice!")
        result_label = ttk.Label(self.master, textvariable=self.result_var, font=("Arial", 16, "bold"))
        result_label.pack(pady=20)

    def custom_roll(self):
        try:
            min_val = int(self.min_val.get())
            max_val = int(self.max_val.get())
            if min_val <= max_val:
                result = random.randint(min_val, max_val)
                self.result_var.set(f"Custom Roll Result: {result}")
                # Clear the input fields after rolling
                self.min_val.delete(0, tk.END)
                self.max_val.delete(0, tk.END)
            else:
                self.result_var.set("Invalid range!")
        except ValueError:
            self.result_var.set("Please enter valid numbers!")

    def increment_dice(self, sides):
        self.dice_counts[sides] += 1
        self.dice_buttons[sides].config(text=f"D{sides} ({self.dice_counts[sides]})")

    def roll_all_dice(self):
        results = []
        
        # Handle custom roll first
        if self.min_val.get() and self.max_val.get():
            self.custom_roll()
            return

        for sides, count in self.dice_counts.items():
            if count > 0:
                dice_results = [random.randint(1, sides) for _ in range(count)]
                results.append(f"{count}D{sides}: {sum(dice_results)} {dice_results}")
        
        if results:
            self.result_var.set("\n".join(results))
        else:
            self.result_var.set("No dice selected!")

        # Reset counts after rolling
        for sides in self.dice_counts:
            self.dice_counts[sides] = 0
            self.dice_buttons[sides].config(text=f"D{sides} (0)")

def open_dice_roller():
    roller_window = tk.Toplevel()
    roller_window.title("Dice Roller")
    DiceRoller(roller_window)

# This function can be called from DCUQA.py to open the dice roller

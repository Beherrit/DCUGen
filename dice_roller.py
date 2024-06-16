import tkinter as tk
from tkinter import ttk
import random

def roll_dice(dice_type):
    return random.randint(1, dice_type)

def open_dice_roller():
    dice_window = tk.Toplevel()
    dice_window.title("Dice Roller")
    dice_window.geometry("200x400")  # Set the window size to 200x400 pixels

    def roll_and_display(dice_type):
        result = roll_dice(dice_type)
        result_label.config(text=f"Result: {result}")

    ttk.Label(dice_window, text="Select a die to roll:").pack(pady=10)

    dice_types = [100, 20, 12, 10, 8, 6, 4, 3, 2]
    for dice in dice_types:
        ttk.Button(dice_window, text=f"D{dice}", command=lambda dice=dice: roll_and_display(dice), width=10).pack(padx=5, pady=5)

    result_label = ttk.Label(dice_window, text="Result: ")
    result_label.pack(pady=10)

if __name__ == "__main__":
    root = tk.Tk()
    open_dice_roller()
    root.mainloop()

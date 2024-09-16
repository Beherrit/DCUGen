import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from PIL import Image, ImageTk
import json
import os
import shutil

class MapEditor:
    def __init__(self, master):
        self.master = master
        self.master.title("GM Map")
        self.master.attributes('-topmost', False)
        
        self.grid_size = 50
        self.tokens = {}
        self.image_locked = False
        self.grid_locked = False
        self.map_locked = False
        
        self.main_frame = tk.Frame(self.master)
        self.main_frame.pack(fill=tk.BOTH, expand=True)
        
        self.frame = tk.Frame(self.main_frame)
        self.frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.canvas = tk.Canvas(self.frame)
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.scrollbar_x = tk.Scrollbar(self.frame, orient=tk.HORIZONTAL, command=self.canvas.xview)
        self.scrollbar_x.pack(side=tk.BOTTOM, fill=tk.X)
        self.scrollbar_y = tk.Scrollbar(self.frame, orient=tk.VERTICAL, command=self.canvas.yview)
        self.scrollbar_y.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.canvas.configure(xscrollcommand=self.scrollbar_x.set, yscrollcommand=self.scrollbar_y.set)
        
        self.zoom_factor = 1.0
        self.range_start = None
        self.range_line = None
        self.range_text = None
        self.setup_ui()
        self.setup_bindings()
        self.create_notes_window()
        
        self.library_visible = False
        self.library_frame = None
        self.library_data = {"maps": [], "tokens": []}
        self.setup_library()
        self.load_library_data()
        
        self.dragging = False
        self.drag_item = None
        self.drag_token = None
        self.drag_token_image = None

    def setup_ui(self):
        toolbar = tk.Frame(self.master)
        toolbar.pack(side=tk.TOP, fill=tk.X)
        
        tk.Button(toolbar, text="Upload Map", command=self.upload_map).pack(side=tk.LEFT)
        tk.Button(toolbar, text="Add Token", command=self.add_token).pack(side=tk.LEFT)
        tk.Button(toolbar, text="Fit to Screen", command=self.fit_to_screen).pack(side=tk.LEFT)
        tk.Button(toolbar, text="Save", command=self.save_map).pack(side=tk.LEFT)
        
        self.grid_size_slider = tk.Scale(toolbar, from_=20, to=100, resolution=5, orient=tk.HORIZONTAL, label="Grid Size", command=self.update_grid_size)
        self.grid_size_slider.set(self.grid_size)
        self.grid_size_slider.pack(side=tk.LEFT)
        
        self.lock_image_var = tk.BooleanVar()
        tk.Checkbutton(toolbar, text="Lock Image", variable=self.lock_image_var, command=self.toggle_image_lock).pack(side=tk.LEFT)
        
        self.lock_grid_var = tk.BooleanVar()
        tk.Checkbutton(toolbar, text="Lock Grid", variable=self.lock_grid_var, command=self.toggle_grid_lock).pack(side=tk.LEFT)
        
        self.lock_map_var = tk.BooleanVar()
        tk.Checkbutton(toolbar, text="Lock Map", variable=self.lock_map_var, command=self.toggle_map_lock).pack(side=tk.LEFT)
        
        self.always_on_top_var = tk.BooleanVar(value=False)
        tk.Checkbutton(toolbar, text="Always on Top", variable=self.always_on_top_var, command=self.toggle_always_on_top).pack(side=tk.LEFT)
        
        tk.Button(toolbar, text="Clear Map", command=self.clear_map).pack(side=tk.LEFT)
        tk.Button(toolbar, text="Toggle Library", command=self.toggle_library).pack(side=tk.LEFT)

    def setup_bindings(self):
        self.canvas.bind("<ButtonPress-1>", self.on_click)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.canvas.bind("<MouseWheel>", self.on_mousewheel)
        self.canvas.bind("<Button-4>", self.on_mousewheel)
        self.canvas.bind("<Button-5>", self.on_mousewheel)
        self.canvas.bind("<B3-Motion>", self.on_right_drag)
        self.canvas.bind("<ButtonPress-3>", self.on_right_click)
        self.canvas.bind("<ButtonRelease-3>", self.on_right_release)
        
    def on_click(self, event):
        self.start_x = self.canvas.canvasx(event.x)
        self.start_y = self.canvas.canvasy(event.y)
        self.clicked_token = self.canvas.find_withtag("current")
        
    def on_drag(self, event):
        if self.clicked_token and "token" in self.canvas.gettags(self.clicked_token):
            x = self.canvas.canvasx(event.x)
            y = self.canvas.canvasy(event.y)
            self.canvas.move(self.clicked_token, x - self.start_x, y - self.start_y)
            self.start_x = x
            self.start_y = y
            new_pos = self.canvas.coords(self.clicked_token)
            if new_pos:
                self.tokens[self.clicked_token[0]]["last_position"] = new_pos
        elif not self.map_locked:
            self.canvas.scan_dragto(event.x, event.y, gain=1)
        
    def on_release(self, event):
        self.clicked_token = None
        
    def toggle_image_lock(self):
        self.image_locked = self.lock_image_var.get()
        
    def toggle_grid_lock(self):
        self.grid_locked = self.lock_grid_var.get()
        
    def toggle_map_lock(self):
        self.map_locked = self.lock_map_var.get()
        if self.map_locked:
            self.center_map()

    def center_map(self):
        if hasattr(self, 'map_image'):
            self.canvas.delete("all")
            
            canvas_width = self.canvas.winfo_width()
            canvas_height = self.canvas.winfo_height()
            image_width, image_height = self.map_image.size
            
            x_offset = max(0, (canvas_width - image_width) // 2)
            y_offset = max(0, (canvas_height - image_height) // 2)
            
            self.tk_image = ImageTk.PhotoImage(self.map_image)
            self.canvas.create_image(x_offset, y_offset, anchor=tk.NW, image=self.tk_image, tags="map")
            
            if not self.grid_locked:
                self.draw_grid(x_offset, y_offset)
            
            self.redraw_tokens(x_offset, y_offset)
            
            self.canvas.config(scrollregion=(0, 0, max(canvas_width, image_width), max(canvas_height, image_height)))
            
            self.canvas.xview_moveto((image_width - canvas_width) / (2 * image_width) if image_width > canvas_width else 0)
            self.canvas.yview_moveto((image_height - canvas_height) / (2 * image_height) if image_height > canvas_height else 0)

    def draw_grid(self, x_offset=0, y_offset=0):
        if hasattr(self, 'map_image'):
            width, height = self.map_image.size
            zoomed_width = int(width * self.zoom_factor)
            zoomed_height = int(height * self.zoom_factor)
            zoomed_grid_size = int(self.grid_size * self.zoom_factor)
            
            for x in range(x_offset, zoomed_width + x_offset, zoomed_grid_size):
                self.canvas.create_line(x, y_offset, x, zoomed_height + y_offset, fill="gray", tags="grid")
            for y in range(y_offset, zoomed_height + y_offset, zoomed_grid_size):
                self.canvas.create_line(x_offset, y, zoomed_width + x_offset, y, fill="gray", tags="grid")
                
    def redraw_tokens(self, x_offset=0, y_offset=0):
        new_tokens = {}
        for token_id, token_data in self.tokens.items():
            coords = token_data.get("last_position", self.get_map_center())
            x, y = coords
            
            zoomed_x = int(x * self.zoom_factor) + x_offset
            zoomed_y = int(y * self.zoom_factor) + y_offset
            
            zoomed_size = int(self.grid_size * self.zoom_factor)
            token_image = Image.open(token_data["file_path"]).resize((zoomed_size, zoomed_size))
            token_tk_image = ImageTk.PhotoImage(token_image)
            new_id = self.canvas.create_image(zoomed_x, zoomed_y, image=token_tk_image, tags=("token",))
            new_tokens[new_id] = {
                "image": token_tk_image,
                "file_path": token_data["file_path"],
                "last_position": (x, y)
            }
        
        self.tokens = new_tokens

    def get_map_center(self):
        if hasattr(self, 'map_image'):
            width, height = self.map_image.size
            return width // 2, height // 2
        return 0, 0

    def upload_map(self, file_path=None):
        if file_path is None:
            file_path = filedialog.askopenfilename(filetypes=[("Image files", "*.png *.jpg *.jpeg")])
        if file_path:
            self.map_image = Image.open(file_path)
            self.fit_to_screen()

    def add_token(self, file_path=None, x=None, y=None):
        if file_path is None:
            file_path = filedialog.askopenfilename(filetypes=[("Image files", "*.png *.jpg *.jpeg")])
        if file_path:
            if x is None or y is None:
                center_x, center_y = self.get_map_center()
            else:
                center_x, center_y = self.canvas.canvasx(x), self.canvas.canvasy(y)
            
            token_image = Image.open(file_path).resize((self.grid_size, self.grid_size))
            token_tk_image = ImageTk.PhotoImage(token_image)
            token_id = self.canvas.create_image(center_x, center_y, image=token_tk_image, tags=("token",))
            self.tokens[token_id] = {"image": token_tk_image, "file_path": file_path, "last_position": (center_x, center_y)}
            self.canvas.tag_raise(token_id)

    def fit_to_screen(self):
        if hasattr(self, 'map_image'):
            canvas_width = self.canvas.winfo_width()
            canvas_height = self.canvas.winfo_height()
            image_width, image_height = self.map_image.size
            
            width_ratio = canvas_width / image_width
            height_ratio = canvas_height / image_height
            scale = min(width_ratio, height_ratio)
            
            new_size = (int(image_width * scale), int(image_height * scale))
            self.map_image = self.map_image.resize(new_size, Image.LANCZOS)
            self.center_map()

    def calculate_range(self):
        messagebox.showinfo("Range Calculation", "Right-click and drag to measure distance.")
        
    def save_map(self):
        data = {
            "tokens": [(self.canvas.coords(id), self.tokens[id]["file_path"]) for id in self.tokens],
            "grid_size": self.grid_size
        }
        file_path = filedialog.asksaveasfilename(defaultextension=".json")
        if file_path:
            with open(file_path, "w") as f:
                json.dump(data, f)
            messagebox.showinfo("Save", "Map saved successfully!")

    def toggle_always_on_top(self):
        self.master.attributes('-topmost', self.always_on_top_var.get())

    def update_grid_size(self, value):
        self.grid_size = int(value)
        if hasattr(self, 'map_image'):
            if not self.map_locked:
                self.redraw()
            else:
                self.redraw_tokens()

    def redraw(self):
        if hasattr(self, 'map_image'):
            self.canvas.delete("all")
            
            canvas_width = self.canvas.winfo_width()
            canvas_height = self.canvas.winfo_height()
            image_width, image_height = self.map_image.size
            
            zoomed_width = int(image_width * self.zoom_factor)
            zoomed_height = int(image_height * self.zoom_factor)
            
            zoomed_image = self.map_image.resize((zoomed_width, zoomed_height), Image.LANCZOS)
            self.tk_image = ImageTk.PhotoImage(zoomed_image)
            self.canvas.create_image(0, 0, anchor=tk.NW, image=self.tk_image, tags="map")
            
            if not self.grid_locked:
                self.draw_grid()
            
            self.redraw_tokens()
            
            self.canvas.config(scrollregion=(0, 0, zoomed_width, zoomed_height))

    def draw_grid(self, x_offset=0, y_offset=0):
        if hasattr(self, 'map_image'):
            width, height = self.map_image.size
            zoomed_width = int(width * self.zoom_factor)
            zoomed_height = int(height * self.zoom_factor)
            zoomed_grid_size = int(self.grid_size * self.zoom_factor)
            
            for x in range(int(x_offset), int(zoomed_width + x_offset), zoomed_grid_size):
                self.canvas.create_line(x, y_offset, x, zoomed_height + y_offset, fill="gray", tags="grid")
            for y in range(int(y_offset), int(zoomed_height + y_offset), zoomed_grid_size):
                self.canvas.create_line(x_offset, y, zoomed_width + x_offset, y, fill="gray", tags="grid")

    def redraw_tokens(self, x_offset=0, y_offset=0):
        new_tokens = {}
        for token_id, token_data in self.tokens.items():
            coords = token_data.get("last_position", self.get_map_center())
            x, y = coords
            
            zoomed_x = int(x * self.zoom_factor) + x_offset
            zoomed_y = int(y * self.zoom_factor) + y_offset
            
            zoomed_size = int(self.grid_size * self.zoom_factor)
            token_image = Image.open(token_data["file_path"]).resize((zoomed_size, zoomed_size))
            token_tk_image = ImageTk.PhotoImage(token_image)
            new_id = self.canvas.create_image(zoomed_x, zoomed_y, image=token_tk_image, tags=("token",))
            new_tokens[new_id] = {
                "image": token_tk_image,
                "file_path": token_data["file_path"],
                "last_position": (x, y)
            }
        
        self.tokens = new_tokens

    def on_mousewheel(self, event):
        if not hasattr(self, 'map_image'):
            return

        mouse_x = self.canvas.canvasx(event.x)
        mouse_y = self.canvas.canvasy(event.y)

        old_zoom = self.zoom_factor
        if event.num == 5 or event.delta < 0:
            self.zoom_factor *= 0.9
        if event.num == 4 or event.delta > 0:
            self.zoom_factor *= 1.1
        self.zoom_factor = max(0.1, min(self.zoom_factor, 5.0))

        canvas_width = self.canvas.winfo_width()
        canvas_height = self.canvas.winfo_height()
        image_width, image_height = self.map_image.size
        
        x_ratio = mouse_x / (image_width * old_zoom)
        y_ratio = mouse_y / (image_height * old_zoom)

        new_mouse_x = x_ratio * image_width * self.zoom_factor
        new_mouse_y = y_ratio * image_height * self.zoom_factor

        self.canvas.xview_moveto((new_mouse_x - canvas_width / 2) / (image_width * self.zoom_factor))
        self.canvas.yview_moveto((new_mouse_y - canvas_height / 2) / (image_height * self.zoom_factor))

        self.redraw()

    def on_right_click(self, event):
        self.range_start = (self.canvas.canvasx(event.x), self.canvas.canvasy(event.y))
        self.remove_range_elements()

    def on_right_drag(self, event):
        if self.range_start:
            end = (self.canvas.canvasx(event.x), self.canvas.canvasy(event.y))
            self.draw_range_line(self.range_start, end)

    def on_right_release(self, event):
        self.range_start = None

    def draw_range_line(self, start, end):
        self.remove_range_elements()
        self.range_line = self.canvas.create_line(start[0], start[1], end[0], end[1], fill="red", width=2, tags="range")
        
        dx = (end[0] - start[0]) / (self.grid_size * self.zoom_factor)
        dy = (end[1] - start[1]) / (self.grid_size * self.zoom_factor)
        distance = round(((dx ** 2 + dy ** 2) ** 0.5), 1)
        
        midx = (start[0] + end[0]) / 2
        midy = (start[1] + end[1]) / 2
        self.range_text = self.canvas.create_text(midx, midy, text=f"{distance} squares", fill="red", font=("Arial", 12, "bold"), tags="range")

    def remove_range_elements(self):
        if self.range_line:
            self.canvas.delete(self.range_line)
        if self.range_text:
            self.canvas.delete(self.range_text)

    def create_notes_window(self):
        self.notes_frame = tk.Frame(self.main_frame, width=200, bg='white')
        self.notes_frame.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.notes_label = tk.Label(self.notes_frame, text="Notes", font=("Arial", 14, "bold"))
        self.notes_label.pack(pady=10)
        
        self.notes_text = tk.Text(self.notes_frame, wrap=tk.WORD, width=25, height=20)
        self.notes_text.pack(padx=5, pady=5)
        
        self.notes_text.insert(tk.END, "Right click and drag to measure distance between two points.")
        self.notes_text.config(state=tk.DISABLED)

    def setup_library(self):
        self.library_frame = tk.Frame(self.main_frame, width=200, bg='lightgray')
        
        self.library_notebook = ttk.Notebook(self.library_frame)
        self.library_notebook.pack(fill=tk.BOTH, expand=True)
        
        self.maps_frame = ttk.Frame(self.library_notebook)
        self.tokens_frame = ttk.Frame(self.library_notebook)
        
        self.library_notebook.add(self.maps_frame, text='Maps')
        self.library_notebook.add(self.tokens_frame, text='Tokens')
        
        tk.Button(self.maps_frame, text="Upload Map", command=self.upload_to_library).pack()
        tk.Button(self.tokens_frame, text="Upload Token", command=self.upload_to_library).pack()
        
        self.maps_listbox = tk.Listbox(self.maps_frame, selectmode=tk.SINGLE)
        self.maps_listbox.pack(fill=tk.BOTH, expand=True)
        self.maps_listbox.bind('<ButtonPress-1>', self.on_library_item_click)
        
        self.tokens_listbox = tk.Listbox(self.tokens_frame, selectmode=tk.SINGLE)
        self.tokens_listbox.pack(fill=tk.BOTH, expand=True)
        self.tokens_listbox.bind('<ButtonPress-1>', self.on_library_item_click)

    def toggle_library(self):
        if self.library_visible:
            self.library_frame.pack_forget()
            self.library_visible = False
        else:
            self.library_frame.pack(side=tk.RIGHT, fill=tk.Y)
            self.library_visible = True

    def upload_to_library(self):
        file_path = filedialog.askopenfilename(filetypes=[("Image files", "*.png *.jpg *.jpeg")])
        if file_path:
            file_name = os.path.basename(file_path)
            if self.library_notebook.index(self.library_notebook.select()) == 0:
                destination = os.path.join("library", "maps", file_name)
                self.library_data["maps"].append(destination)
                self.maps_listbox.insert(tk.END, file_name)
            else:
                destination = os.path.join("library", "tokens", file_name)
                self.library_data["tokens"].append(destination)
                self.tokens_listbox.insert(tk.END, file_name)
            
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            shutil.copy2(file_path, destination)
        
        self.save_library_data()

    def on_library_item_click(self, event):
        widget = event.widget
        index = widget.nearest(event.y)
        item = widget.get(index)
        
        if widget == self.maps_listbox:
            item_path = os.path.join("library", "maps", item)
            self.preview_item(item_path, is_map=True)
        elif widget == self.tokens_listbox:
            item_path = os.path.join("library", "tokens", item)
            self.preview_item(item_path, is_map=False)

    def preview_item(self, file_path, is_map):
        preview_image = Image.open(file_path)
        preview_image.thumbnail((300, 300))  # Resize for preview
        self.preview_tk_image = ImageTk.PhotoImage(preview_image)
        
        self.preview_window = tk.Toplevel(self.master)
        self.preview_window.title("Preview")
        tk.Label(self.preview_window, image=self.preview_tk_image).pack()
        
        if is_map:
            tk.Button(self.preview_window, text="Use This Map", command=lambda: self.use_map(file_path)).pack()
        else:
            tk.Button(self.preview_window, text="Use This Token", command=lambda: self.use_token(file_path)).pack()

    def use_map(self, file_path):
        self.upload_map(file_path)
        self.preview_window.destroy()

    def use_token(self, file_path):
        center_x, center_y = self.get_map_center()
        self.add_token(file_path, center_x, center_y)
        self.preview_window.destroy()

    def clear_map(self):
        self.canvas.delete("all")
        self.tokens.clear()
        if hasattr(self, 'map_image'):
            delattr(self, 'map_image')
        self.redraw()

    def save_library_data(self):
        with open("library_data.json", "w") as f:
            json.dump(self.library_data, f)

    def load_library_data(self):
        try:
            with open("library_data.json", "r") as f:
                self.library_data = json.load(f)
            
            for map_path in self.library_data["maps"]:
                self.maps_listbox.insert(tk.END, os.path.basename(map_path))
            
            for token_path in self.library_data["tokens"]:
                self.tokens_listbox.insert(tk.END, os.path.basename(token_path))
        except FileNotFoundError:
            pass

if __name__ == "__main__":
    root = tk.Tk()
    root.geometry("1000x600")
    root.attributes('-topmost', False)
    map_app = MapEditor(root)
    root.protocol("WM_DELETE_WINDOW", map_app.save_library_data)
    root.mainloop()
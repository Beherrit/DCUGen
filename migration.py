import requests
import zipfile
import io
import shutil
import sys
import os
import logging
from tkinter import messagebox
import tkinter as tk

# Set up logging
logging.basicConfig(filename='update_log.txt', level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def check_for_updates(current_version):
    """Check GitHub for the latest release version."""
    api_url = "https://api.github.com/repos/Beherrit/DCUGen/releases/latest"
    
    try:
        response = requests.get(api_url)
        response.raise_for_status()
        latest_release = response.json()
        
        if latest_release['tag_name'] > current_version:
            return latest_release['zipball_url'], latest_release['tag_name']
        else:
            return None, None
    except requests.RequestException as e:
        logger.error(f"Failed to check for updates: {e}")
        return None, None

def download_and_apply_update(update_url):
    """Download and apply the update."""
    try:
        # Download the update
        response = requests.get(update_url)
        response.raise_for_status()
        
        # Extract the update
        with zipfile.ZipFile(io.BytesIO(response.content)) as zip_ref:
            # Create a temporary directory for extraction
            temp_dir = "temp_update"
            os.makedirs(temp_dir, exist_ok=True)
            zip_ref.extractall(temp_dir)
            
            # Copy new files, preserving existing data
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    src_path = os.path.join(root, file)
                    dst_path = os.path.join(os.path.dirname(sys.executable), os.path.relpath(src_path, temp_dir))
                    
                    # Don't overwrite user data
                    if not file.endswith(('.db', '.json')) or not os.path.exists(dst_path):
                        os.makedirs(os.path.dirname(dst_path), exist_ok=True)
                        shutil.copy2(src_path, dst_path)
            
            # Clean up
            shutil.rmtree(temp_dir)
        
        return True
    except Exception as e:
        logger.error(f"Failed to apply update: {e}")
        return False

def update_program(current_version):
    """Main function to check for updates and apply them."""
    update_url, latest_version = check_for_updates(current_version)
    if update_url:
        if download_and_apply_update(update_url):
            messagebox.showinfo("Update Successful", f"The program has been updated to version {latest_version}. Please restart to apply changes.")
            logger.info(f"Successfully updated to version {latest_version}")
            return True
        else:
            messagebox.showerror("Update Failed", "Failed to update the program. Please try again later.")
            logger.error("Failed to apply update")
    else:
        messagebox.showinfo("No Updates", "The program is already up to date.")
        logger.info("No updates available")
    return False

def create_update_button(parent, current_version):
    """Create an update button for the main application."""
    update_button = tk.Button(
        parent,
        text="Check for Updates",
        command=lambda: update_program(current_version)
    )
    return update_button

# If you want to run this script standalone for testing
if __name__ == "__main__":
    root = tk.Tk()
    root.title("Update Test")
    current_version = "5.3.2"  # Replace with your current version
    update_button = create_update_button(root, current_version)
    update_button.pack()
    root.mainloop()
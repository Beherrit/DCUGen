import requests
import os

def export_character_to_excel(download_url, filename):
    desktop_path = os.path.join(os.path.expanduser("~/Desktop"), filename)
    response = requests.get(download_url)
    assert response.status_code == 200, 'Download failed, status code: ' + str(response.status_code)

    with open(desktop_path, 'wb') as file:
        file.write(response.content)
    print(f"File saved to {desktop_path}")

# Example usage, replace 'CharacterName.xlsx' with your dynamic filename
filename = 'CharacterName.xlsx'
download_url = 'https://docs.google.com/spreadsheets/d/1xORbDVdMInDBM_IyFp5I1ri25GIiPmperiEikayuh4o/export?format=xlsx'
export_character_to_excel(download_url, filename)

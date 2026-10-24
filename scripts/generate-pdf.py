import os
import shutil
from playwright.sync_api import sync_playwright

html_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'documents', 'selamet-turizm-sunum.html'))
pdf_out_docs = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'documents', 'Selamet_Turizm_Ozel_Sistem_Sunumu.pdf'))
pdf_out_public = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'public', 'Selamet_Turizm_Ozel_Sistem_Sunumu.pdf'))

print(f"Reading HTML from: {html_path}")

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page()
    page.goto(f"file:///{html_path.replace(os.sep, '/')}", wait_until='networkidle')
    
    # Wait for webfonts to load
    page.wait_for_timeout(1500)
    
    page.pdf(
        path=pdf_out_docs,
        format='A4',
        print_background=True,
        prefer_css_page_size=True,
        margin={'top': '0mm', 'bottom': '0mm', 'left': '0mm', 'right': '0mm'}
    )
    browser.close()

# Copy to public folder for direct URL access
shutil.copyfile(pdf_out_docs, pdf_out_public)

size_mb = os.path.getsize(pdf_out_docs) / (1024 * 1024)
print(f"PDF generated successfully!")
print(f"File 1: {pdf_out_docs} ({size_mb:.2f} MB)")
print(f"File 2: {pdf_out_public} ({size_mb:.2f} MB)")

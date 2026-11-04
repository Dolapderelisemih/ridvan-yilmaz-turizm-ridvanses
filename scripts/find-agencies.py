import urllib.request
import re

url = "https://hac.gov.tr"
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8', errors='ignore')
    pdfs = re.findall(r'href=[\'"]([^\'"]+acenta[^\'"]*\.pdf)[\'"]', html, re.I)
    print("Found PDFs:", pdfs)
    if not pdfs:
        all_pdfs = re.findall(r'href=[\'"]([^\'"]+\.pdf)[\'"]', html, re.I)
        print("All PDFs:", all_pdfs[:10])
except Exception as e:
    print("Error:", e)

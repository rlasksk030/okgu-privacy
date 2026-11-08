"""Bundle the synthetic-data preview without network or third-party packages."""
from pathlib import Path
import base64
import re
import sys

root = Path(__file__).resolve().parents[1]
public = root / "public"
output = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "dist" / "preview.html"
html = (public / "index.html").read_text()
html = re.sub(r'<link[^>]+(?:manifest|apple-touch-icon)[^>]*>', '', html)
html = html.replace('<link rel="stylesheet" href="/style.css">', '<style>' + (public / "style.css").read_text() + '</style>')
html = re.sub(r'<script type="module" src="/app.js"></script>', '', html)
parts = []
for filename in ["model.js", "demo.js", "app.js"]:
    script = (public / filename).read_text()
    script = re.sub(r'^import .*?;\n', '', script, flags=re.M)
    script = re.sub(r'^export ', '', script, flags=re.M)
    if filename == "app.js":
        script = script.replace("demo=params.get('demo')==='1'", "demo=true")
        script = script.replace("if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});", '')
        script = script.replace("if(demo){location.href='/';return;}", "if(demo){toast('이 파일은 예시 데이터 미리보기예요.');return;}")
    parts.append(script)
html = html.replace('</body>', '<script type="module">\n' + '\n'.join(parts).replace('</script', '<\\/script') + '\n</script>\n</body>')
icon = 'data:image/svg+xml;base64,' + base64.b64encode((public / 'icon.svg').read_bytes()).decode()
html = html.replace('src="/icon.svg"', 'src="' + icon + '"').replace('href="/icon.svg"', 'href="' + icon + '"')
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html)
print(output.resolve())

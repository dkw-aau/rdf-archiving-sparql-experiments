import os
import sys
import json


def extract_sections(qr: str):
    core_start = qr.find('{')
    core_end = qr.rfind('}')
    core_txt = qr[core_start+1:core_end]
    head_txt = qr[:core_start]
    return (head_txt, core_txt)

def section_to_lines(sec: str):
    lines = {}
    ln = 0
    indent = 0
    skip_indent = False
    for l in sec.split('\n'):
        l = l.strip()
        if '{' in l:
            indent += 1
            skip_indent = True
        if '}' in l:
            indent -= 1
        if not l == "":
            t = ''
            for i in range(indent-int(skip_indent)):
                t += '\t'
            lines[ln] = t+l
        ln += 1
        skip_indent = False
    return lines

def process_files(path: str):
    files = os.listdir(path)
    
    qr = {}
    for f in files:
        f_base_name = int(f.replace('.txt', '')[1:])
        with open(os.path.join(path, f), 'r') as fd:
            txt = fd.read()
            h, c = extract_sections(txt)
            qr[f_base_name] = {'header': section_to_lines(h), 'core': section_to_lines(c)}
    js = json.dumps(qr, indent=4, sort_keys=True)
    return js


def main():
    if (len(sys.argv) != 3):
        print('Usage: <query_folder_path> <output_name>')
        sys.exit(1)
    output_name = sys.argv[2]
    if (not output_name.endswith('.json')):
        output_name += '.json'
    js = process_files(sys.argv[1])
    with open(os.path.join('.', output_name), 'w', encoding='utf-8') as f:
        f.write(js)
    

main()

// A small JSON reader: the data and the parties come from the JS side as JSON, and nothing else is needed.
#[derive(Debug, Clone, PartialEq)]
pub enum J { Null, Bool(bool), Num(f64), Str(String), Arr(Vec<J>), Obj(Vec<(String, J)>) }

impl J {
    pub fn parse(s: &str) -> Result<J, String> {
        let b = s.as_bytes(); let mut p = 0;
        let v = value(b, &mut p)?; ws(b, &mut p);
        if p != b.len() { return Err(format!("json: trailing text at {}", p)); }
        Ok(v)
    }
    pub fn get(&self, k: &str) -> Option<&J> { if let J::Obj(o) = self { o.iter().find(|(n, _)| n == k).map(|(_, v)| v) } else { None } }
    pub fn at(&self, k: &str) -> &J { self.get(k).unwrap_or_else(|| panic!("json: no key {}", k)) }
    pub fn num(&self) -> f64 { if let J::Num(n) = self { *n } else { panic!("json: not a number: {:?}", self) } }
    pub fn str(&self) -> &str { if let J::Str(s) = self { s } else { panic!("json: not a string: {:?}", self) } }
    pub fn arr(&self) -> &[J] { if let J::Arr(a) = self { a } else { panic!("json: not an array: {:?}", self) } }
    pub fn obj(&self) -> &[(String, J)] { if let J::Obj(o) = self { o } else { panic!("json: not an object: {:?}", self) } }
    pub fn truthy(&self) -> bool { match self { J::Null => false, J::Bool(b) => *b, J::Num(n) => *n != 0.0, J::Str(s) => !s.is_empty(), _ => true } }
}

fn ws(b: &[u8], p: &mut usize) { while *p < b.len() && matches!(b[*p], b' ' | b'\n' | b'\r' | b'\t') { *p += 1; } }
fn value(b: &[u8], p: &mut usize) -> Result<J, String> {
    ws(b, p);
    if *p >= b.len() { return Err("json: unexpected end".into()); }
    match b[*p] {
        b'{' => {
            *p += 1; let mut o = Vec::new(); ws(b, p);
            if b[*p] == b'}' { *p += 1; return Ok(J::Obj(o)); }
            loop {
                ws(b, p); let k = string(b, p)?; ws(b, p);
                if b[*p] != b':' { return Err(format!("json: ':' expected at {}", p)); }
                *p += 1; let v = value(b, p)?; o.push((k, v)); ws(b, p);
                match b[*p] { b',' => *p += 1, b'}' => { *p += 1; return Ok(J::Obj(o)); } _ => return Err(format!("json: ',' or '}}' expected at {}", p)) }
            }
        }
        b'[' => {
            *p += 1; let mut a = Vec::new(); ws(b, p);
            if b[*p] == b']' { *p += 1; return Ok(J::Arr(a)); }
            loop {
                a.push(value(b, p)?); ws(b, p);
                match b[*p] { b',' => *p += 1, b']' => { *p += 1; return Ok(J::Arr(a)); } _ => return Err(format!("json: ',' or ']' expected at {}", p)) }
            }
        }
        b'"' => Ok(J::Str(string(b, p)?)),
        b't' if b[*p..].starts_with(b"true") => { *p += 4; Ok(J::Bool(true)) }
        b'f' if b[*p..].starts_with(b"false") => { *p += 5; Ok(J::Bool(false)) }
        b'n' if b[*p..].starts_with(b"null") => { *p += 4; Ok(J::Null) }
        _ => {
            let s = *p;
            while *p < b.len() && matches!(b[*p], b'0'..=b'9' | b'-' | b'+' | b'.' | b'e' | b'E') { *p += 1; }
            std::str::from_utf8(&b[s..*p]).ok().and_then(|t| t.parse::<f64>().ok()).map(J::Num).ok_or_else(|| format!("json: bad value at {}", s))
        }
    }
}
fn string(b: &[u8], p: &mut usize) -> Result<String, String> {
    if b[*p] != b'"' { return Err(format!("json: string expected at {}", p)); }
    *p += 1; let mut out: Vec<u8> = Vec::new();
    while *p < b.len() {
        match b[*p] {
            b'"' => { *p += 1; return String::from_utf8(out).map_err(|e| e.to_string()); }
            b'\\' => {
                *p += 1;
                match b[*p] {
                    b'n' => out.push(b'\n'), b't' => out.push(b'\t'), b'r' => out.push(b'\r'), b'b' => out.push(8), b'f' => out.push(12),
                    b'u' => {
                        let h = std::str::from_utf8(&b[*p + 1..*p + 5]).map_err(|e| e.to_string())?;
                        let c = u32::from_str_radix(h, 16).map_err(|e| e.to_string())?;
                        let mut buf = [0u8; 4]; out.extend_from_slice(char::from_u32(c).unwrap_or('?').encode_utf8(&mut buf).as_bytes()); *p += 4;
                    }
                    c => out.push(c),
                }
                *p += 1;
            }
            c => { out.push(c); *p += 1; }
        }
    }
    Err("json: string not closed".into())
}

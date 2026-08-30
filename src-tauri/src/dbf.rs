//! dBase III/IV (.DTA/.DBF) file parser with memo (.DBT) support.
//! Handles the Clipper variant used by PCPAIE, including W (wide) field types.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use encoding_rs::WINDOWS_1252;

/// A single field definition in a dBase file header.
#[derive(Debug, Clone)]
pub struct DbfField {
    pub name: String,
    pub field_type: char,   // C, N, L, D, M, W
    pub length: u8,
    #[allow(dead_code)]
    pub decimals: u8,
}

/// dBase file header metadata.
#[derive(Debug)]
pub struct DbfHeader {
    #[allow(dead_code)]
    pub version: u8,
    pub record_count: u32,
    pub header_size: u16,
    pub record_size: u16,
    pub fields: Vec<DbfField>,
}

/// Reader for a dBase III/IV (.DTA) file.
pub struct DbfReader {
    file: File,
    pub header: DbfHeader,
    /// Path to the associated .DBT memo file (if any).
    #[allow(dead_code)]
    dbt_path: Option<String>,
    /// Cached memo file reader.
    dbt: Option<File>,
    /// Block size for DBT memo file (default 512).
    dbt_block_size: u32,
}

/// A parsed record value.
#[derive(Debug, Clone)]
pub enum DbfValue {
    Text(String),
    Number(f64),
    Logical(bool),
    Date(String),
    Empty,
}

impl DbfReader {
    /// Open a .DTA file and parse its header. If the file has memo fields (M/W),
    /// the associated .DBT file is opened automatically (same stem, .DBT extension).
    pub fn open(path: &str) -> Result<Self, String> {
        let mut file = File::open(path).map_err(|e| format!("Cannot open {}: {}", path, e))?;
        let header = Self::parse_header(&mut file)?;

        // Check if there are memo fields
        let has_memo = header
            .fields
            .iter()
            .any(|f| f.field_type == 'M' || f.field_type == 'W');

        let mut dbt_path = None;
        let mut dbt = None;
        if has_memo {
            // Try .DBT with same stem
            let p = Path::new(path);
            let stem = p.file_stem().map(|s| s.to_string_lossy().to_string());
            let parent = p.parent();
            if let (Some(stem), Some(parent)) = (stem, parent) {
                let dbt_p = parent.join(format!("{}.DBT", stem));
                if dbt_p.exists() {
                    dbt_path = Some(dbt_p.to_string_lossy().to_string());
                    dbt = Some(
                        File::open(&dbt_p)
                            .map_err(|e| format!("Cannot open memo file {}: {}", dbt_p.display(), e))?,
                    );
                }
                // Also try lowercase .dbt
                if dbt.is_none() {
                    let dbt_p = parent.join(format!("{}.dbt", stem));
                    if dbt_p.exists() {
                        dbt_path = Some(dbt_p.to_string_lossy().to_string());
                        dbt = Some(
                            File::open(&dbt_p)
                                .map_err(|e| format!("Cannot open memo file {}: {}", dbt_p.display(), e))?,
                        );
                    }
                }
            }
        }

        // Seek to first record
        file.seek(SeekFrom::Start(header.header_size as u64))
            .map_err(|e| e.to_string())?;

        Ok(DbfReader {
            file,
            header,
            dbt_path,
            dbt,
            dbt_block_size: 512, // Standard dBase III block size
        })
    }

    fn parse_header(file: &mut File) -> Result<DbfHeader, String> {
        let mut hdr_buf = [0u8; 32];
        file.read_exact(&mut hdr_buf)
            .map_err(|e| format!("Cannot read header: {}", e))?;

        let version = hdr_buf[0];
        let record_count = u32::from_le_bytes([hdr_buf[4], hdr_buf[5], hdr_buf[6], hdr_buf[7]]);
        let header_size = u16::from_le_bytes([hdr_buf[8], hdr_buf[9]]);
        let record_size = u16::from_le_bytes([hdr_buf[10], hdr_buf[11]]);

        // Parse field descriptors (32 bytes each, terminated by 0x0D)
        let num_fields = ((header_size as usize) - 32 - 1) / 32;
        let mut fields = Vec::with_capacity(num_fields);

        for _ in 0..num_fields {
            let mut field_buf = [0u8; 32];
            file.read_exact(&mut field_buf)
                .map_err(|e| format!("Cannot read field descriptor: {}", e))?;

            let name = String::from_utf8_lossy(&field_buf[0..11])
                .trim_end_matches('\0')
                .to_string();
            let field_type = field_buf[11] as char;
            let length = field_buf[16];
            let decimals = field_buf[17];

            fields.push(DbfField {
                name,
                field_type,
                length,
                decimals,
            });
        }

        // Read and verify the header terminator (0x0D)
        let mut term = [0u8; 1];
        file.read_exact(&mut term)
            .map_err(|e| format!("Cannot read header terminator: {}", e))?;

        Ok(DbfHeader {
            version,
            record_count,
            header_size,
            record_size,
            fields,
        })
    }

    /// Read the next record. Returns None at end of file.
    /// Returns a map of field_name -> DbfValue.
    /// Deleted records (marked with '*') are skipped automatically.
    pub fn read_record(&mut self) -> Result<Option<Vec<(String, DbfValue)>>, String> {
        let rec_size = self.header.record_size as usize;
        let mut rec_buf = vec![0u8; rec_size];

        loop {
            let n = self
                .file
                .read(&mut rec_buf)
                .map_err(|e| format!("Cannot read record: {}", e))?;
            if n == 0 {
                return Ok(None); // EOF
            }
            if n < rec_size {
                // Partial record at end of file — treat as EOF
                return Ok(None);
            }

            // First byte is deletion flag: ' ' = active, '*' = deleted
            let del_flag = rec_buf[0];
            if del_flag == b'*' {
                continue; // Skip deleted record
            }
            break;
        }

        // Parse fields — first pass: extract field metadata and raw bytes
        // (avoid borrowing self.header.fields while calling self.read_memo)
        let field_infos: Vec<(String, char, Vec<u8>)> = {
            let mut offset = 1;
            let mut infos = Vec::with_capacity(self.header.fields.len());
            for field in &self.header.fields {
                let field_len = field.length as usize;
                let raw = rec_buf[offset..offset + field_len].to_vec();
                offset += field_len;
                infos.push((field.name.clone(), field.field_type, raw));
            }
            infos
        };

        // Second pass: parse values (memo fields can now borrow self mutably)
        let mut values = Vec::with_capacity(field_infos.len());
        for (name, field_type, raw) in field_infos {
            let value = match field_type {
                'C' => {
                    let text = decode_text(&raw);
                    if text.trim().is_empty() {
                        DbfValue::Empty
                    } else {
                        DbfValue::Text(text.trim().to_string())
                    }
                }
                'N' => {
                    let text = String::from_utf8_lossy(&raw).trim().to_string();
                    if text.is_empty() {
                        DbfValue::Empty
                    } else {
                        match text.parse::<f64>() {
                            Ok(v) => DbfValue::Number(v),
                            Err(_) => DbfValue::Empty,
                        }
                    }
                }
                'L' => {
                    let c = raw[0] as char;
                    DbfValue::Logical(matches!(c, 'T' | 't' | 'Y' | 'y'))
                }
                'D' => {
                    let text = String::from_utf8_lossy(&raw).trim().to_string();
                    if text.is_empty() || text == "        " {
                        DbfValue::Empty
                    } else {
                        DbfValue::Date(text)
                    }
                }
                'M' | 'W' => {
                    // Memo field: 10-digit ASCII block number
                    let block_str = String::from_utf8_lossy(&raw).trim().to_string();
                    if block_str.is_empty() || block_str == "0" {
                        DbfValue::Empty
                    } else {
                        match block_str.parse::<u64>() {
                            Ok(block_num) if block_num > 0 => {
                                match self.read_memo(block_num) {
                                    Ok(text) => {
                                        if text.trim().is_empty() {
                                            DbfValue::Empty
                                        } else {
                                            DbfValue::Text(text)
                                        }
                                    }
                                    Err(_) => DbfValue::Empty,
                                }
                            }
                            _ => DbfValue::Empty,
                        }
                    }
                }
                _ => {
                    let text = decode_text(&raw);
                    if text.trim().is_empty() {
                        DbfValue::Empty
                    } else {
                        DbfValue::Text(text.trim().to_string())
                    }
                }
            };
            values.push((name, value));
        }

        Ok(Some(values))
    }

    /// Read a memo from the DBT file at the given block number.
    /// The memo data starts at block_number * block_size.
    /// First 2 bytes are skipped (header), then text until 0x1A terminator.
    fn read_memo(&mut self, block_number: u64) -> Result<String, String> {
        let dbt = self
            .dbt
            .as_mut()
            .ok_or_else(|| "No memo file open".to_string())?;

        let offset = block_number * self.dbt_block_size as u64;
        dbt.seek(SeekFrom::Start(offset))
            .map_err(|e| format!("Cannot seek to memo block {}: {}", block_number, e))?;

        // Read up to 64KB (should be enough for any single memo)
        let mut buf = vec![0u8; 65536];
        let n = dbt
            .read(&mut buf)
            .map_err(|e| format!("Cannot read memo block: {}", e))?;

        if n < 2 {
            return Ok(String::new());
        }

        // Skip first 2 bytes (Clipper DBT header)
        let data = &buf[2..n];

        // Find 0x1A (EOF) terminator
        let end = data.iter().position(|&b| b == 0x1A).unwrap_or(n - 2);

        // Decode as Windows-1252
        let (text, _, _) = WINDOWS_1252.decode(&data[..end]);
        Ok(text.to_string())
    }

    /// Get the total number of records (including deleted).
    pub fn record_count(&self) -> u32 {
        self.header.record_count
    }
}

/// Decode bytes as Windows-1252 text.
fn decode_text(bytes: &[u8]) -> String {
    let (text, _, _) = WINDOWS_1252.decode(bytes);
    text.to_string()
}

/// Helper: get a string value from a record, or empty string if not found/empty.
pub fn get_str(record: &[(String, DbfValue)], name: &str) -> String {
    for (n, v) in record {
        if n.eq_ignore_ascii_case(name) {
            return match v {
                DbfValue::Text(s) => s.clone(),
                DbfValue::Date(s) => s.clone(),
                DbfValue::Number(n) => n.to_string(),
                DbfValue::Logical(b) => if *b { "T".into() } else { "F".into() },
                DbfValue::Empty => String::new(),
            };
        }
    }
    String::new()
}

/// Helper: get a number value from a record, or 0.0 if not found/empty.
pub fn get_num(record: &[(String, DbfValue)], name: &str) -> f64 {
    for (n, v) in record {
        if n.eq_ignore_ascii_case(name) {
            return match v {
                DbfValue::Number(n) => *n,
                DbfValue::Text(s) => s.parse().unwrap_or(0.0),
                _ => 0.0,
            };
        }
    }
    0.0
}

/// Helper: get a boolean value from a record.
pub fn get_bool(record: &[(String, DbfValue)], name: &str) -> bool {
    for (n, v) in record {
        if n.eq_ignore_ascii_case(name) {
            return match v {
                DbfValue::Logical(b) => *b,
                DbfValue::Text(s) => matches!(s.as_str(), "T" | "t" | "Y" | "y" | "1"),
                DbfValue::Number(n) => *n != 0.0,
                _ => false,
            };
        }
    }
    false
}

/// Helper: get an optional string value (returns None if empty).
#[allow(dead_code)]
pub fn get_opt_str(record: &[(String, DbfValue)], name: &str) -> Option<String> {
    let s = get_str(record, name);
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

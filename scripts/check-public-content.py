#!/usr/bin/env python3
"""Bounded, offline content review of exact Git index bytes; not a secret scanner."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import html
import io
import json
from pathlib import Path, PurePosixPath
import re
import resource
import shutil
import signal
import stat
import struct
import subprocess
import sys
import tempfile
import tarfile
import time
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
import zlib

SCHEMA = "public-content-check/v1"
NORMALIZATION = "nfkd-casefold-markless-alnum-v1"
OFFICE_SUFFIXES = frozenset({".docx", ".pptx", ".xlsx"})
IMAGE_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tif", ".tiff"})
LOCAL_DIRS = frozenset({"node_modules", ".next", ".mastra", ".venv", "venv", "__pycache__", ".cache", ".aws", ".ssh", ".gnupg", "private-notes", "private_notes"})


def normalize_tokens(text: str) -> list[str]:
    text = unicodedata.normalize("NFKD", html.unescape(text)).casefold()
    text = "".join(c for c in text if not unicodedata.category(c).startswith("M") and unicodedata.category(c) != "Cf")
    return "".join(c if c.isalnum() else " " for c in text).split()


def phrase_sha256(text: str) -> str:
    return hashlib.sha256(" ".join(normalize_tokens(text)).encode("utf-8")).hexdigest()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class CheckError(Exception):
    """An error code safe to print without exposing source content."""


class Guard:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.targets: dict[int, set[str]] = {}
        self.files: list[dict] = []
        self.findings: list[dict] = []
        self.errors: list[dict] = []
        self.warnings: list[dict] = []
        self.total_bytes = 0
        self.inventory_count = 0
        self.inventory_complete = False
        self.inspection_complete = False
        self.inventory_sha256 = None
        self.config_sha256 = None
        self.pdftotext = shutil.which(args.pdftotext)
        self.pdfinfo = shutil.which(args.pdfinfo)

    def load_config(self) -> None:
        try:
            config_path = Path(self.args.name_hashes)
            if config_path.stat().st_size > 1024 * 1024:
                raise ValueError()
            data = config_path.read_bytes()
            config = json.loads(data)
            if set(config) != {"schema", "normalization", "hashes"} or config["schema"] != "public-content-name-hashes/v1" or config["normalization"] != NORMALIZATION:
                raise ValueError()
            if not isinstance(config["hashes"], list) or not 1 <= len(config["hashes"]) <= 10000:
                raise ValueError()
            for entry in config["hashes"]:
                if set(entry) != {"tokens", "sha256"} or type(entry["tokens"]) is not int or not 1 <= entry["tokens"] <= 12 or not re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]):
                    raise ValueError()
                self.targets.setdefault(entry["tokens"], set()).add(entry["sha256"])
            self.config_sha256 = sha256(data)
        except (OSError, ValueError, TypeError, KeyError, RecursionError):
            raise CheckError("invalid_or_unreadable_name_hash_config") from None

    def matches(self, text: str) -> bool:
        tokens = normalize_tokens(text)
        for size, hashes in self.targets.items():
            for start in range(len(tokens) - size + 1):
                if hashlib.sha256(" ".join(tokens[start:start + size]).encode()).hexdigest() in hashes:
                    return True
        return False

    def location(self, path: str) -> dict:
        # A sensitive phrase may itself be a file/archive-member name.
        display = "[redacted-sensitive-path]" if self.matches(path) else path
        return {"path": display, "pathSHA256": sha256(path.encode("utf-8", errors="surrogateescape"))}

    def finding(self, path: str, code: str) -> None:
        item = {**self.location(path), "code": code}
        if item not in self.findings:
            self.findings.append(item)

    def scan_text(self, text: str, path: str) -> None:
        if self.matches(text):
            self.finding(path, "configured_phrase_detected")

    def xml_text(self, text: str, path: str) -> None:
        if re.search(r"<!\s*(DOCTYPE|ENTITY)\b", text, re.I):
            raise CheckError("xml_declarations_not_supported")
        try:
            root = ET.fromstring(text)
        except (ET.ParseError, ValueError, RecursionError):
            raise CheckError("invalid_xml") from None
        # Joined catches a word split across runs; spaced catches separate runs
        # that omit a literal separator. Both are conservative review signals.
        chunks = list(root.itertext())
        self.scan_text("".join(chunks), path)
        self.scan_text(" ".join(chunks), path)
        blocks = {"p", "si", "creator", "lastModifiedBy", "title", "subject", "description", "keywords", "property", "li"}
        for element in root.iter():
            if element.tag.rsplit("}", 1)[-1] in blocks:
                pieces = list(element.itertext())
                self.scan_text("".join(pieces), path)
                self.scan_text(" ".join(pieces), path)
            for value in element.attrib.values():
                self.scan_text(value, path)

    def json_text(self, text: str, path: str, lines: bool = False) -> None:
        try:
            objects = (json.loads(line) for line in text.splitlines() if line.strip()) if lines else [json.loads(text)]
            for obj in objects:
                pending = [(obj, 0)]
                while pending:
                    value, depth = pending.pop()
                    if depth > 100:
                        raise CheckError("json_nesting_limit_exceeded")
                    if isinstance(value, str):
                        self.scan_text(value, path)
                        if value.lstrip().startswith(("{", "[", '"')):
                            try:
                                pending.append((json.loads(value), depth + 1))
                            except (ValueError, RecursionError):
                                pass  # Ordinary prose is not required to be JSON.
                    elif isinstance(value, dict):
                        for key, child in value.items():
                            self.scan_text(key, path)
                            pending.append((child, depth + 1))
                    elif isinstance(value, list):
                        pending.extend((child, depth + 1) for child in value)
        except (ValueError, RecursionError):
            raise CheckError("invalid_json") from None

    @staticmethod
    def decode(data: bytes) -> str:
        try:
            if data.startswith((b"\xff\xfe", b"\xfe\xff")):
                text = data.decode("utf-16")
            else:
                text = data.decode("utf-8-sig")
            if "\x00" in text:
                raise ValueError()
            return text
        except (UnicodeError, ValueError):
            raise CheckError("unsupported_text_encoding_or_binary") from None

    def zip_comment(self, data: bytes, path: str) -> None:
        if not data:
            return
        try:
            text = data.decode("utf-8")
        except UnicodeError:
            text = data.decode("cp437")
        if any(ord(c) < 32 and c not in "\t\r\n" for c in text):
            raise CheckError("unsupported_binary_zip_comment")
        self.scan_text(text, path)

    def office(self, data: bytes, path: str) -> dict:
        xml_count, media_count, expanded, unsupported_count = 0, 0, 0, 0
        comment_count, extra_bytes, local_extra_bytes = 0, 0, 0
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                self.zip_comment(archive.comment, path + "!<container-comment>")
                members = archive.infolist()
                if len(members) > self.args.max_archive_entries:
                    raise CheckError("archive_entry_limit_exceeded")
                if len({m.filename for m in members}) != len(members):
                    raise CheckError("duplicate_archive_members")
                if "[Content_Types].xml" not in {m.filename for m in members}:
                    raise CheckError("invalid_office_package")
                for member in members:
                    where = path + "!" + member.filename
                    self.scan_text(member.filename, where)
                    self.zip_comment(member.comment, where + "!<member-comment>")
                    comment_count += bool(member.comment)
                    extra_bytes += len(member.extra)
                    offset = member.header_offset
                    if offset < 0 or data[offset:offset + 4] != b"PK\x03\x04" or offset + 30 > len(data):
                        raise CheckError("invalid_zip_local_header")
                    name_length = int.from_bytes(data[offset + 26:offset + 28], "little")
                    extra_length = int.from_bytes(data[offset + 28:offset + 30], "little")
                    if offset + 30 + name_length + extra_length > len(data):
                        raise CheckError("invalid_zip_local_header")
                    local_extra_bytes += extra_length
                    mode_type = stat.S_IFMT(member.external_attr >> 16)
                    if not self.safe_member_path(member.filename) or member.flag_bits & 1 or mode_type not in {0, stat.S_IFREG, stat.S_IFDIR}:
                        raise CheckError("unsafe_or_encrypted_archive_member")
                    if member.is_dir():
                        continue
                    expanded += member.file_size
                    if member.file_size > self.args.max_member_bytes or expanded > self.args.max_archive_bytes:
                        raise CheckError("archive_expansion_limit_exceeded")
                    suffix = PurePosixPath(member.filename).suffix.lower()
                    if suffix in {".xml", ".rels", ".svg"} or PurePosixPath(member.filename).name == ".rels":
                        chunk = archive.read(member)
                        text = self.decode(chunk)
                        self.scan_text(text, where)
                        self.xml_text(text, where)
                        xml_count += 1
                        if suffix == ".svg":
                            self.warnings.append({**self.location(where), "code": "svg_visual_content_not_ocr_scanned"})
                    elif suffix in IMAGE_SUFFIXES:
                        if not self.is_image(archive.read(member), suffix):
                            raise CheckError("image_signature_mismatch")
                        media_count += 1
                    else:
                        unsupported_count += 1
                        self.errors.append({**self.location(where), "code": "unsupported_office_embedded_binary"})
                if extra_bytes or local_extra_bytes:
                    self.warnings.append({**self.location(path), "code": "zip_extra_fields_not_decoded", "centralDirectoryBytes": extra_bytes, "localHeaderBytes": local_extra_bytes})
                if media_count:
                    self.warnings.append({**self.location(path), "code": "office_images_not_ocr_or_metadata_scanned", "count": media_count})
        except (zipfile.BadZipFile, OSError, RuntimeError, NotImplementedError):
            raise CheckError("office_extraction_failed") from None
        return {"kind": "office", "xmlMembersScanned": xml_count, "imageMembersNotScanned": media_count, "expandedBytes": expanded, "unsupportedMembers": unsupported_count, "containerCommentScanned": True, "memberCommentsScanned": comment_count, "extraFieldBytesNotDecoded": extra_bytes + local_extra_bytes, "centralDirectoryExtraBytes": extra_bytes, "localHeaderExtraBytes": local_extra_bytes, "arbitraryBinaryMetadataDecoded": False}

    def pdf_command(self, command: list[str], directory: str) -> str:
        # Bound disk output instead of buffering arbitrary extractor output.
        dest = Path(directory) / "extracted.txt"
        try:
            with dest.open("wb") as output:
                result = subprocess.run(command, stdout=output, stderr=subprocess.DEVNULL, timeout=self.args.extract_timeout, check=False, preexec_fn=lambda: resource.setrlimit(resource.RLIMIT_FSIZE, (self.args.max_extracted_bytes, self.args.max_extracted_bytes)))
            if result.returncode != 0:
                raise CheckError("pdf_extractor_failed")
            if dest.stat().st_size > self.args.max_extracted_bytes:
                raise CheckError("pdf_extracted_text_limit_exceeded")
            return self.decode(dest.read_bytes())
        except (OSError, subprocess.TimeoutExpired):
            raise CheckError("pdf_extractor_failed_or_timed_out") from None

    def pdf(self, data: bytes, path: str) -> dict:
        if not self.pdftotext or not self.pdfinfo:
            raise CheckError("required_pdf_extractor_unavailable")
        with tempfile.TemporaryDirectory(prefix="public-content-pdf-") as temp:
            source = Path(temp) / "input.pdf"
            source.write_bytes(data)
            texts = [self.pdf_command([self.pdftotext, "-enc", "UTF-8", "-nopgbrk", str(source), "-"], temp),
                     self.pdf_command([self.pdfinfo, str(source)], temp),
                     self.pdf_command([self.pdfinfo, "-meta", str(source)], temp)]
            for text in texts:
                self.scan_text(text, path)
            if texts[2].strip():
                self.xml_text(texts[2], path)
            if not texts[0].strip():
                self.warnings.append({**self.location(path), "code": "pdf_has_no_extractable_text"})
        self.warnings.append({**self.location(path), "code": "pdf_images_not_ocr_scanned"})
        return {"kind": "pdf", "textExtracted": True, "standardMetadataScanned": True, "xmpMetadataScanned": True, "ocrPerformed": False}

    @staticmethod
    def is_image(data: bytes, suffix: str) -> bool:
        signatures = {
            ".png": data.startswith(b"\x89PNG\r\n\x1a\n"),
            ".jpg": data.startswith(b"\xff\xd8\xff"), ".jpeg": data.startswith(b"\xff\xd8\xff"),
            ".gif": data.startswith((b"GIF87a", b"GIF89a")),
            ".webp": data.startswith(b"RIFF") and data[8:12] == b"WEBP",
            ".ico": data.startswith(b"\0\0\1\0"), ".bmp": data.startswith(b"BM"),
            ".tif": data.startswith((b"II*\0", b"MM\0*")), ".tiff": data.startswith((b"II*\0", b"MM\0*")),
        }
        return signatures.get(suffix, False)

    @staticmethod
    def forbidden_path(path: str) -> bool:
        parts = PurePosixPath(path.casefold()).parts
        if not parts:
            return False
        name = parts[-1]
        if any(part in LOCAL_DIRS for part in parts):
            return True
        if name in {".env", ".envrc"} or (name.startswith(".env.") and name not in {".env.example", ".env.sample", ".env.template"}):
            return True
        if name in {"client_secret.json", "service-account-key.json", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "credentials", "credentials.json", ".ds_store"}:
            return True
        if name.endswith((".pem", ".key", ".p12", ".pfx", ".keystore", ".db", ".sqlite", ".sqlite3", ".db-wal", ".db-shm", ".sqlite-wal", ".sqlite-shm", ".pyc")):
            return True
        return bool(re.search(r"(?:^|[/_.-])private[_.-](?:note|notes|research|authorship)(?:[_.-]|/|$)", path.casefold()))

    @contextmanager
    def archive_timeout(self):
        previous_handler = signal.getsignal(signal.SIGALRM)
        previous_timer = signal.getitimer(signal.ITIMER_REAL)
        started = time.monotonic()
        def expired(_signum, _frame):
            raise CheckError("archive_processing_timed_out")
        signal.signal(signal.SIGALRM, expired)
        signal.setitimer(signal.ITIMER_REAL, self.args.extract_timeout)
        try:
            yield
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous_handler)
            if previous_timer[0]:
                signal.setitimer(signal.ITIMER_REAL, max(0.001, previous_timer[0] - (time.monotonic() - started)), previous_timer[1])

    @staticmethod
    def safe_member_path(name: str) -> bool:
        return bool(name) and not name.startswith("/") and ".." not in PurePosixPath(name).parts and "\\" not in name and not re.match(r"^[A-Za-z]:", name)

    def compressed(self, data: bytes, path: str) -> dict:
        # One gzip member only: concatenated streams and opaque header extras
        # are rejected, so metadata or additional content cannot be skipped.
        if len(data) < 18 or data[:3] != b"\x1f\x8b\x08" or data[3] & 0xE0:
            raise CheckError("invalid_gzip")
        flags, offset = data[3], 10
        if flags & 4:
            raise CheckError("unsupported_gzip_extra_metadata")
        for flag in (8, 16):
            if flags & flag:
                stop = data.find(b"\0", offset)
                if stop < 0 or stop - offset > self.args.max_member_bytes:
                    raise CheckError("invalid_gzip_header")
                value = data[offset:stop]
                try:
                    metadata = value.decode("utf-8")
                except UnicodeError:
                    metadata = value.decode("latin-1")
                self.scan_text(metadata, path)
                if flag == 8:
                    if not self.safe_member_path(metadata):
                        raise CheckError("unsafe_gzip_original_filename")
                    if self.forbidden_path(metadata):
                        self.finding(path, "forbidden_publication_path")
                offset = stop + 1
        if flags & 2:
            offset += 2
        if offset > len(data) - 8:
            raise CheckError("invalid_gzip_header")
        try:
            decoder = zlib.decompressobj(31)
            expanded = decoder.decompress(data, self.args.max_archive_bytes + 1)
            if len(expanded) > self.args.max_archive_bytes or decoder.unconsumed_tail:
                raise CheckError("archive_expansion_limit_exceeded")
            if not decoder.eof:
                raise CheckError("truncated_gzip")
            if decoder.unused_data:
                raise CheckError("concatenated_or_trailing_gzip_data")
        except zlib.error:
            raise CheckError("invalid_gzip") from None
        inner_path = path[:-3] if path.lower().endswith(".gz") else path + "!decoded"
        if inner_path.lower().endswith(".tar"):
            return self.tar_content(expanded, path)
        result = self.member_content(expanded, inner_path)
        return {"kind": "gzip", "expandedBytes": len(expanded), "payload": result, "metadataScanned": True}

    def tar_content(self, data: bytes, path: str) -> dict:
        entries, files, expanded, names, image_files, failed_files, metadata_files = 0, 0, 0, set(), 0, 0, 0
        try:
            with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as archive:
                for member in archive:
                    entries += 1
                    if entries > self.args.max_archive_entries:
                        raise CheckError("archive_entry_limit_exceeded")
                    where = path + "!" + member.name
                    self.scan_text(member.name, where)
                    for value in (member.uname, member.gname, *member.pax_headers.keys(), *member.pax_headers.values()):
                        self.scan_text(str(value), where)
                    if not self.safe_member_path(member.name):
                        raise CheckError("unsafe_archive_member_path")
                    canonical = str(PurePosixPath(member.name))
                    if canonical in names:
                        raise CheckError("duplicate_archive_members")
                    names.add(canonical)
                    if self.forbidden_path(member.name):
                        self.finding(where, "forbidden_publication_path")
                    if member.isdir():
                        if member.size:
                            raise CheckError("invalid_tar_directory_size")
                        continue
                    if not member.isfile() or member.issparse():
                        raise CheckError("archive_links_devices_or_sparse_not_supported")
                    expanded += member.size
                    if member.size > self.args.max_member_bytes or expanded > self.args.max_archive_bytes:
                        raise CheckError("archive_expansion_limit_exceeded")
                    source = archive.extractfile(member)  # Stream only; never extract to disk.
                    if source is None:
                        raise CheckError("tar_member_read_failed")
                    with source:
                        payload = source.read(self.args.max_member_bytes + 1)
                    if len(payload) != member.size:
                        raise CheckError("tar_member_read_failed")
                    errors_before = len(self.errors)
                    try:
                        inspection = self.member_content(payload, where)
                        image_files += inspection.get("contentScanned") is False
                        metadata_files += inspection.get("kind") == "appledouble"
                    except CheckError as error:
                        if str(error) == "archive_processing_timed_out":
                            raise
                        self.errors.append({**self.location(where), "code": str(error)})
                    failed_files += len(self.errors) > errors_before
                    files += 1
                # Refuse nonzero bytes after the TAR end marker, including a
                # concealed concatenated archive. Standard zero padding is OK.
                if any(data[archive.offset:]):
                    raise CheckError("trailing_tar_data")
        except (tarfile.TarError, OSError, ValueError, RecursionError):
            raise CheckError("invalid_tar") from None
        return {"kind": "tar_gzip", "entriesScanned": entries, "filesInspected": files, "filesScanned": files - image_files - failed_files, "imageFilesNotContentScanned": image_files, "metadataFilesInspected": metadata_files, "unsupportedMembers": failed_files, "regularMemberInspectionComplete": True, "expandedBytes": len(data), "memberBytes": expanded, "metadataScanned": True}

    def appledouble(self, data: bytes, path: str) -> dict:
        # Narrow RFC 1740 v2 + Apple's copyfile ATTR layout. No unpacking,
        # xattr application, or inferred decoder for opaque attribute values.
        if len(data) < 26 or data[:8] != bytes.fromhex("0005160700020000"):
            raise CheckError("invalid_appledouble_magic_or_version")
        count = struct.unpack_from(">H", data, 24)[0]
        table_end = 26 + 12 * count
        if not 1 <= count <= self.args.max_archive_entries or table_end > len(data):
            raise CheckError("invalid_appledouble_entry_table")
        filler = data[8:24].rstrip(b"\0")
        if filler:
            self.metadata_text(filler, path)
        entries, ids = [], set()
        for index in range(count):
            kind, offset, size = struct.unpack_from(">III", data, 26 + index * 12)
            if not kind or kind in ids or offset < table_end or offset + size > len(data):
                raise CheckError("invalid_appledouble_entry_range")
            ids.add(kind)
            entries.append((offset, size, kind))
        self.validate_ranges([(o, n) for o, n, _ in entries], table_end, len(data), data, "appledouble")
        text_count, opaque_count, attr_count = 0, 0, 0
        for offset, size, kind in entries:
            where = path + "!<entry-" + str(kind) + ">"
            chunk = data[offset:offset + size]
            if kind in {3, 4, 13}:
                self.metadata_text(chunk, where)
                text_count += 1
            elif kind == 2 and not size:
                continue
            elif kind == 9:
                if size < 32:
                    raise CheckError("invalid_appledouble_finder_info_size")
                if any(chunk[:32]):
                    self.errors.append({**self.location(where), "code": "unsupported_appledouble_finder_info"})
                    opaque_count += 1
                if size == 32:
                    continue
                start = (offset + 35) & ~3
                end = offset + size
                if start + 36 > end or any(data[offset + 32:start]):
                    raise CheckError("invalid_appledouble_attribute_header")
                magic, debug, total, data_start, data_length, r1, r2, r3, flags, number = struct.unpack_from(">IIIIIIIIHH", data, start)
                if magic != 0x41545452 or debug or r1 or r2 or r3 or flags or total != end or data_start < start + 36 or data_start > total or data_length != total - data_start or number > self.args.max_archive_entries:
                    raise CheckError("invalid_appledouble_attribute_header")
                cursor, ranges, keys, attributes = start + 36, [], set(), []
                for i in range(number):
                    if cursor + 11 > data_start:
                        raise CheckError("invalid_appledouble_attribute_table")
                    at, length, aflags, name_length = struct.unpack_from(">IIHB", data, cursor)
                    name_end = cursor + 11 + name_length
                    aligned = (name_end + 3) & ~3
                    if not 1 <= name_length <= 128 or aligned > data_start or aflags or at < data_start or at + length > total or any(data[name_end:aligned]):
                        raise CheckError("invalid_appledouble_attribute_range")
                    encoded = data[cursor + 11:name_end]
                    if not encoded.endswith(b"\0") or b"\0" in encoded[:-1]:
                        raise CheckError("invalid_appledouble_attribute_name")
                    name = self.decode(encoded[:-1])
                    if name in keys:
                        raise CheckError("duplicate_appledouble_attribute")
                    keys.add(name)
                    attr_where = where + "!<attribute-" + str(i + 1) + ">"
                    self.scan_text(name, attr_where)
                    attributes.append((at, length, name, attr_where))
                    ranges.append((at, length))
                    cursor = aligned
                if any(data[cursor:data_start]):
                    raise CheckError("unclaimed_appledouble_header_bytes")
                self.validate_ranges(ranges, data_start, total, data, "appledouble_attribute")
                for at, length, name, attr_where in attributes:
                    attr_count += 1
                    value = data[at:at + length]
                    try:
                        self.metadata_text(value, attr_where)
                        text_count += 1
                    except CheckError as error:
                        if str(error) == "archive_processing_timed_out":
                            raise
                        # Record hashes and a nonidentifying type classification
                        # for a separate review; no binary allowlist is applied.
                        self.errors.append({**self.location(attr_where), "code": "opaque_appledouble_attribute", "attributeType": "apple_provenance" if name == "com.apple.provenance" else "other", "attributeNameSHA256": sha256(name.encode()), "bytes": length, "payloadSHA256": sha256(value)})
                        opaque_count += 1
            else:
                self.errors.append({**self.location(where), "code": "unsupported_appledouble_entry", "bytes": size, "payloadSHA256": sha256(chunk)})
                opaque_count += 1
        return {"kind": "appledouble", "entriesValidated": count, "attributesInspected": attr_count, "textValuesScanned": text_count, "unsupportedMembers": opaque_count, "opaquePayloadsDecoded": False}

    @staticmethod
    def validate_ranges(ranges: list[tuple[int, int]], lower: int, upper: int, data: bytes, prefix: str) -> None:
        cursor = lower
        for offset, size in sorted(ranges):
            if offset < lower or offset + size > upper or (size and offset < cursor):
                raise CheckError(prefix + "_overlapping_or_invalid_ranges")
            if offset >= cursor and any(data[cursor:offset]):
                raise CheckError(prefix + "_unclaimed_bytes")
            cursor = max(cursor, offset + size)
        if any(data[cursor:upper]):
            raise CheckError(prefix + "_unclaimed_bytes")

    def metadata_text(self, data: bytes, path: str) -> None:
        text = self.decode(data)
        if any(unicodedata.category(c).startswith("C") and c not in "\t\r\n" for c in text):
            raise CheckError("opaque_metadata_value")
        self.scan_text(text, path)
        if text.lstrip().startswith(("{", "[")):
            try:
                json.loads(text)
            except (ValueError, RecursionError):
                pass
            else:
                self.json_text(text, path)

    def member_content(self, data: bytes, path: str) -> dict:
        if data.startswith(bytes.fromhex("00051607")) or PurePosixPath(path).name.startswith("._"):
            return self.appledouble(data, path)
        suffix = PurePosixPath(path).suffix.lower()
        if suffix in OFFICE_SUFFIXES or suffix in {".gz", ".zip", ".tar", ".tgz", ".bz2", ".xz", ".7z"} or data.startswith((b"PK\x03\x04", b"\x1f\x8b")) or data[257:262] == b"ustar":
            raise CheckError("nested_or_unsupported_archive")
        if suffix in IMAGE_SUFFIXES:
            if not self.is_image(data, suffix):
                raise CheckError("image_signature_mismatch")
            self.warnings.append({**self.location(path), "code": "image_not_ocr_or_metadata_scanned"})
            return {"kind": "image", "contentScanned": False, "manualReviewRequired": True}
        text = self.decode(data)
        self.scan_text(text, path)
        if suffix in {".json", ".jsonl"}:
            self.json_text(text, path, suffix == ".jsonl")
        elif suffix in {".xml", ".rels", ".svg"} or PurePosixPath(path).name == ".rels":
            self.xml_text(text, path)
        if suffix == ".svg":
            self.warnings.append({**self.location(path), "code": "svg_visual_content_not_ocr_scanned"})
        return {"kind": "text", "decodedJsonScanned": suffix in {".json", ".jsonl"}, "svgVisualReviewRequired": suffix == ".svg"}

    def inspect(self, path: str, data: bytes) -> dict:
        self.scan_text(path, path)
        if self.forbidden_path(path):
            self.finding(path, "forbidden_publication_path")
        self.total_bytes += len(data)
        if len(data) > self.args.max_file_bytes or self.total_bytes > self.args.max_total_bytes:
            raise CheckError("file_or_total_byte_limit_exceeded")
        suffix = PurePosixPath(path).suffix.lower()
        if suffix in OFFICE_SUFFIXES:
            with self.archive_timeout():
                return self.office(data, path)
        if suffix == ".gz":
            with self.archive_timeout():
                return self.compressed(data, path)
        if suffix == ".pdf" or data.startswith(b"%PDF-"):
            return self.pdf(data, path)
        return self.member_content(data, path)

    def git(self, *args: str) -> bytes:
        try:
            return subprocess.run(["git", "-C", self.args.repo, *args], check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30).stdout
        except (OSError, subprocess.SubprocessError):
            raise CheckError("git_inventory_failed") from None

    def run(self) -> None:
        self.load_config()
        inventory_bytes = self.git("ls-files", "--stage", "-z")
        self.inventory_sha256 = sha256(inventory_bytes)
        entries = inventory_bytes.split(b"\0")
        staged = set(self.git("diff", "--cached", "--name-only", "-z", "--diff-filter=ACMRT").split(b"\0"))
        inventory = []
        for entry in entries:
            if not entry:
                continue
            metadata, raw_path = entry.split(b"\t", 1)
            mode, oid, stage = metadata.decode("ascii").split()
            path = raw_path.decode("utf-8", errors="surrogateescape")
            if stage != "0":
                self.errors.append({**self.location(path), "code": "unmerged_index_entry"})
                continue
            inventory.append((path, mode, oid, raw_path in staged))
        self.inventory_count = len(inventory)
        self.inventory_complete = True
        if len(inventory) > self.args.max_files:
            raise CheckError("inventory_file_limit_exceeded")
        if not inventory:
            raise CheckError("empty_index_inventory")
        # Persistent cat-file avoids a process per file. Index blob IDs, not
        # worktree contents, define the release bytes even for staged additions.
        process = subprocess.Popen(["git", "-C", self.args.repo, "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            for path, mode, oid, is_staged in inventory:
                record = {**self.location(path), "gitObject": oid, "stagedChange": is_staged, "mode": mode}
                self.files.append(record)
                self.scan_text(path, path)
                if self.forbidden_path(path):
                    self.finding(path, "forbidden_publication_path")
                if mode != "100644" and mode != "100755":
                    record["coverage"] = "failed"
                    self.errors.append({**self.location(path), "code": "symlink_or_submodule_not_supported"})
                    continue
                process.stdin.write((oid + "\n").encode("ascii"))
                process.stdin.flush()
                header = process.stdout.readline(256).split()
                if len(header) != 3 or header[1] != b"blob":
                    raise CheckError("git_blob_read_failed")
                size = int(header[2])
                if size > self.args.max_file_bytes or self.total_bytes + size > self.args.max_total_bytes:
                    raise CheckError("file_or_total_byte_limit_exceeded")
                data = process.stdout.read(size)
                if len(data) != size or process.stdout.read(1) != b"\n":
                    raise CheckError("git_blob_read_failed")
                record.update({"bytes": size, "sha256": sha256(data)})
                try:
                    warnings_before = len(self.warnings)
                    record["extraction"] = self.inspect(path, data)
                    manual_warnings = len(self.warnings) - warnings_before
                    record["extraction"]["manualReviewRequired"] = bool(manual_warnings)
                    record["extraction"]["manualReviewWarnings"] = manual_warnings
                    record["coverage"] = "partial" if record["extraction"].get("unsupportedMembers") else "manual_review_required" if record["extraction"]["kind"] == "image" else "scanned_with_manual_review" if manual_warnings else "scanned"
                except CheckError as error:
                    record["coverage"] = "failed"
                    self.errors.append({**self.location(path), "code": str(error)})
            if self.git("ls-files", "--stage", "-z") != inventory_bytes:
                raise CheckError("git_index_changed_during_scan")
            self.inspection_complete = True
        finally:
            process.stdin.close()
            process.terminate()
            process.wait(timeout=5)

    def report(self) -> dict:
        return {"schema": SCHEMA, "scope": "git_index", "status": "fail" if self.findings or self.errors else "pass_with_limitations", "normalization": NORMALIZATION,
                "nameConfigSHA256": self.config_sha256, "indexInventorySHA256": self.inventory_sha256, "counts": {"inventoryFiles": self.inventory_count, "files": len(self.files), "bytes": self.total_bytes, "findings": len(self.findings), "errors": len(self.errors), "warnings": len(self.warnings)},
                "coverage": {"trackedAndStagedIndexBytes": True, "inventoryComplete": self.inventory_complete, "inspectionComplete": self.inspection_complete, "untrackedFiles": False, "gitHistory": False, "ocrPerformed": False, "dedicatedSecretScanPerformed": False, "manualImageReviewRequired": bool(self.warnings)},
                "files": self.files, "findings": self.findings, "errors": self.errors, "warnings": self.warnings}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=".")
    parser.add_argument("--index", action="store_true", help="Scan the Git index (also the default).")
    parser.add_argument("--name-hashes", required=True, help="Path to a hashes-only normalized phrase configuration.")
    parser.add_argument("--report", help="Write JSON to this path; otherwise print JSON to stdout.")
    parser.add_argument("--pdftotext", default="pdftotext")
    parser.add_argument("--pdfinfo", default="pdfinfo")
    parser.add_argument("--max-files", type=int, default=20000)
    parser.add_argument("--max-file-bytes", type=int, default=32 * 1024 * 1024)
    parser.add_argument("--max-total-bytes", type=int, default=512 * 1024 * 1024)
    parser.add_argument("--max-archive-entries", type=int, default=4096)
    parser.add_argument("--max-member-bytes", type=int, default=8 * 1024 * 1024)
    parser.add_argument("--max-archive-bytes", type=int, default=64 * 1024 * 1024)
    parser.add_argument("--max-extracted-bytes", type=int, default=16 * 1024 * 1024)
    parser.add_argument("--extract-timeout", type=int, default=20)
    args = parser.parse_args()
    guard = Guard(args)
    try:
        if any(value <= 0 for key, value in vars(args).items() if key.startswith("max_") or key == "extract_timeout"):
            raise CheckError("invalid_resource_limits")
        guard.run()
    except CheckError as error:
        guard.errors.append({"code": str(error)})
    except (OSError, ValueError, subprocess.SubprocessError):
        guard.errors.append({"code": "content_check_operation_failed"})
    report = guard.report()
    encoded = json.dumps(report, ensure_ascii=True, indent=2) + "\n"
    if args.report:
        try:
            Path(args.report).write_text(encoded, encoding="utf-8")
        except OSError:
            print(json.dumps({"schema": SCHEMA, "status": "fail", "errors": [{"code": "report_write_failed"}]}))
            return 2
    else:
        print(encoded, end="")
    return 2 if guard.errors else 1 if guard.findings else 0


if __name__ == "__main__":
    sys.exit(main())

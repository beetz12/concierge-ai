---
name: openai-image-api
description: Diagnose and fix OpenAI Images API errors - generate vs edit method selection, reference images, MIME types, gpt-image-1/1.5 best practices
---

# OpenAI Images API Debugging Skill

Diagnose and fix OpenAI Images API errors including method selection issues, reference image handling, MIME type problems, and gpt-image-1/1.5 API best practices (2025).

## When to Use

- `AsyncImages.generate() got an unexpected keyword argument 'image'`
- OpenAI image generation fails when using reference images
- `unsupported mimetype 'application/octet-stream'` errors
- Need to add annotations, edit, or modify existing images
- Confusion between `images.generate()` vs `images.edit()`
- gpt-image-1, gpt-image-1.5, or DALL-E model errors

## Quick Diagnosis

| Error Pattern | Root Cause | Fix |
|---------------|------------|-----|
| `unexpected keyword argument 'image'` | Using `generate()` with reference images | Use `images.edit()` instead |
| `unsupported mimetype 'application/octet-stream'` | Passing raw bytes without MIME type | Use tuple: `(filename, bytes, content_type)` |
| `Expected entry at 'image' to be bytes` | Passing data URI string to `edit()` | Decode base64 to bytes first |
| Reference image not applied | Wrong API method | Use `edit()` for any reference image work |
| `Invalid file format` | Wrong image type | Use PNG, JPEG, or WebP only |

---

## Issue #1: generate() vs edit() Method Selection (Most Common)

**Error:** `AsyncImages.generate() got an unexpected keyword argument 'image'`

**Cause:** OpenAI's `images.generate()` method is for **text-to-image only** - it does NOT accept an `image` parameter. The code is trying to pass reference images to the wrong method.

**Key Concept (2025 API):**
| Method | Purpose | Reference Images |
|--------|---------|------------------|
| `images.generate()` | Create new images from text prompts only | NO - does not accept `image` param |
| `images.edit()` | Edit/annotate/modify existing images | YES - accepts `image` param |

**Fix:**
```python
# WRONG - generate() doesn't accept 'image' parameter
response = await client.images.generate(
    model="gpt-image-1.5",
    prompt="Add annotations to this image",
    image=image_data,  # This causes the error!
)

# CORRECT - use edit() for reference images
response = await client.images.edit(
    model="gpt-image-1.5",
    prompt="Add annotations to this image",
    image=image_tuple,  # This works!
)
```

**When to use each:**
- `images.generate()` - Pure text-to-image, no reference needed
- `images.edit()` - ANY operation involving existing images (annotation, editing, style transfer, composition)

---

## Issue #2: Image Format for edit() Method

**Error:** `Expected entry at 'image' to be bytes, an io.IOBase instance, PathLike or a tuple`

**Cause:** `images.edit()` expects bytes or file-like objects, not strings (including data URIs).

**Fix - Convert data URI to bytes:**
```python
import base64

# If you have a data URI
data_uri = "data:image/jpeg;base64,/9j/4AAQ..."

# Strip prefix and decode to bytes
if data_uri.startswith('data:'):
    prefix, b64_data = data_uri.split(',', 1)
    mime_type = prefix.split(':')[1].split(';')[0]  # e.g., 'image/jpeg'
else:
    b64_data = data_uri
    mime_type = 'image/png'  # Default

image_bytes = base64.b64decode(b64_data)
```

---

## Issue #3: MIME Type Detection (Octet-Stream Error)

**Error:** `unsupported mimetype ('application/octet-stream'). Supported file formats are 'image/jpeg', 'image/png', and 'image/webp'`

**Cause:** OpenAI can't detect the MIME type from raw bytes alone. You must provide the content type explicitly.

**Fix - Pass as tuple with MIME type:**
```python
import base64

# Decode base64 to bytes
image_bytes = base64.b64decode(main_image_b64)

# Determine extension from MIME type
ext = mime_type.split('/')[-1]  # 'image/jpeg' -> 'jpeg'
if ext == 'jpeg':
    ext = 'jpg'

# OpenAI SDK accepts tuple: (filename, bytes, content_type)
image_tuple = (f"image.{ext}", image_bytes, mime_type)

# Pass tuple to edit()
response = await client.images.edit(
    model="gpt-image-1.5",
    prompt=request.prompt,
    image=image_tuple,  # Tuple with MIME type
    size="1024x1024",
)
```

**MIME Type Detection from Magic Bytes:**
```python
def detect_mime_type(image_bytes: bytes) -> str:
    """Detect MIME type from image magic bytes."""
    if image_bytes.startswith(b'\x89PNG'):
        return 'image/png'
    elif image_bytes.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    elif image_bytes.startswith(b'RIFF') and b'WEBP' in image_bytes[:20]:
        return 'image/webp'
    else:
        return 'image/png'  # Default
```

---

## Issue #4: Complete Working Pattern (2025 Best Practice)

**For reference-based image operations (annotation, editing, etc.):**

```python
import base64
from openai import AsyncOpenAI

async def generate_with_reference(
    client: AsyncOpenAI,
    prompt: str,
    reference_image_b64: str,
    mime_type: str = "image/png"
) -> str:
    """Generate/edit image using reference image."""

    # 1. Decode base64 to bytes
    image_bytes = base64.b64decode(reference_image_b64)

    # 2. Determine file extension
    ext = mime_type.split('/')[-1]
    if ext == 'jpeg':
        ext = 'jpg'

    # 3. Create tuple: (filename, bytes, content_type)
    image_tuple = (f"image.{ext}", image_bytes, mime_type)

    # 4. Use images.edit() for reference-based generation
    response = await client.images.edit(
        model="gpt-image-1.5",
        prompt=prompt,
        image=image_tuple,
        size="1024x1024",
    )

    # 5. Return base64 result
    return response.data[0].b64_json
```

**For text-only image generation:**

```python
async def generate_from_text(
    client: AsyncOpenAI,
    prompt: str
) -> str:
    """Generate image from text prompt only."""

    # Use images.generate() - NO image parameter
    response = await client.images.generate(
        model="gpt-image-1.5",
        prompt=prompt,
        size="1024x1024",
        quality="high",
    )

    return response.data[0].b64_json
```

---

## Issue #5: Handling URLs as Reference Images

**Problem:** Reference images might be URLs (e.g., Supabase storage URLs) that need to be downloaded first.

**Fix - Normalize URL to base64:**
```python
import httpx
import base64

async def normalize_image_to_base64(image_input: str) -> tuple[str, str]:
    """
    Normalize image input (URL, data URL, or base64) to pure base64.
    Returns: (base64_string, mime_type)
    """
    # Handle Supabase/HTTP URLs
    if image_input.startswith('http://') or image_input.startswith('https://'):
        async with httpx.AsyncClient() as client:
            response = await client.get(image_input)
            response.raise_for_status()

            # Get MIME type from Content-Type header
            content_type = response.headers.get('content-type', 'image/jpeg')
            mime_type = content_type.split(';')[0]

            # Encode to base64
            image_b64 = base64.b64encode(response.content).decode('utf-8')
            return image_b64, mime_type

    # Handle data URLs
    elif image_input.startswith('data:'):
        prefix, b64_data = image_input.split(',', 1)
        mime_type = prefix.split(':')[1].split(';')[0]
        return b64_data, mime_type

    # Assume raw base64
    else:
        # Detect MIME from magic bytes
        decoded = base64.b64decode(image_input[:100])
        if decoded.startswith(b'\x89PNG'):
            mime_type = 'image/png'
        elif decoded.startswith(b'\xff\xd8\xff'):
            mime_type = 'image/jpeg'
        else:
            mime_type = 'image/png'
        return image_input, mime_type
```

---

## Issue #6: gpt-image-1.5 vs gpt-image-1 Differences

**Model Capabilities:**

| Feature | gpt-image-1 | gpt-image-1.5 |
|---------|-------------|---------------|
| Reference images | Yes (via edit) | Yes (via edit) |
| Max reference images | 16 | 16 |
| input_fidelity control | Yes | Yes |
| Best for | Standard editing | State-of-the-art quality |

**input_fidelity Parameter (edit only):**
```python
response = await client.images.edit(
    model="gpt-image-1.5",
    image=image_tuple,
    prompt="Match the style of this image",
    input_fidelity="high",  # "high" or "low"
)
```
- `"high"` - Model exerts more effort to match reference image style/features
- `"low"` - Less strict matching (default)

---

## Debugging Checklist

### Before API Call
- [ ] Using `images.edit()` for reference images (NOT `generate()`)
- [ ] Image passed as tuple: `(filename, bytes, content_type)`
- [ ] MIME type is valid: `image/png`, `image/jpeg`, or `image/webp`
- [ ] Base64 is decoded to bytes (not passed as string)
- [ ] URLs are downloaded and converted to base64 first

### After Error
- [ ] Check error message for method name (`generate` vs `edit`)
- [ ] Check if error mentions "unexpected keyword argument" → wrong method
- [ ] Check if error mentions "mimetype" → need tuple format
- [ ] Check if error mentions "bytes" → decode base64 first

### Common Fixes Summary

| Symptom | First Thing to Check |
|---------|---------------------|
| `unexpected keyword argument 'image'` | Change `generate()` to `edit()` |
| `unsupported mimetype` | Pass image as `(filename, bytes, mime_type)` tuple |
| `Expected bytes` | Decode base64 string to bytes |
| Reference not applied | Verify using `images.edit()` not `generate()` |
| Wrong image format | Ensure PNG, JPEG, or WebP |

---

## Key Files (pFrame Project)

| File | Purpose |
|------|---------|
| `apps/api/app/routers/image_generator.py` | Main image generation endpoint |
| `apps/api/pframe/api/openai_image_client.py` | OpenAI API client wrapper |

---

## References

- [OpenAI Images API Reference](https://platform.openai.com/docs/api-reference/images/)
- [OpenAI Image Generation Guide](https://platform.openai.com/docs/guides/image-generation)
- [GPT-Image-1.5 Prompting Guide](https://cookbook.openai.com/examples/multimodal/image-gen-1.5-prompting_guide)

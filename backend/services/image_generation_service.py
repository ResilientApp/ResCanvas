"""
image_generation_service.py

Implements:
1) Text → Image generation (Stable Diffusion XL via Hugging Face Inference API)
2) Image → Canvas conversion as SVG (vectorization with potrace; base64 SVG fallback)
3) Style transfer (image-to-image, prompt-driven edits)
4) Sketch beautification (local cleanup + optional refinement)

Requirements:
    pip install huggingface_hub pillow
Optional (for true vectorization):
    pip install potrace numpy pixels2svg 
"""
from typing import Optional
from PIL import Image, ImageFilter, ImageOps

from config import HUGGINGFACE_API_KEY
from huggingface_hub import InferenceClient

# Model choices
HF_IMG_TXT2IMG = "stabilityai/stable-diffusion-xl-base-1.0"  # text → image
HF_IMG_EDIT    = "timbrooks/instruct-pix2pix"                # image → image (edits/style)


def _get_hf_client() -> InferenceClient:
    """
    Create and return a Hugging Face InferenceClient using HUGGINGFACE_API_KEY
    from config or environment. Raises if no token is available.
    """
    if not HUGGINGFACE_API_KEY:
        raise RuntimeError("HUGGINGFACE_API_KEY not configured. Set in config.py or environment.")
    return InferenceClient(token=HUGGINGFACE_API_KEY)


def generate_image_from_prompt(
    prompt: str,
    size: str = "1024x1024",
) -> Optional[Image.Image]:
    """
    Generate an image from a natural-language text prompt via Stable Diffusion XL.

    Args:
        prompt: Description of the target image.
        size: Output resolution as "WxH" (e.g., "512x512", "1024x1024").

    Returns:
        PIL.Image on success, or None on failure.
    """
    try:
        client = _get_hf_client()
        img = client.text_to_image(
            model=HF_IMG_TXT2IMG,
            prompt=prompt,
            size=size,
        )
        return img
    except Exception as e:
        print(f"image_generation: text_to_image failed: {e}")
        return None

def apply_style_transfer(
    source_image: Image.Image,
    style_prompt: str,
    strength: float = 0.6,
) -> Optional[Image.Image]:
    """
    Apply a target style to an input image via image-to-image diffusion.

    Args:
        source_image: PIL image to restyle.
        style_prompt: Text like "watercolor style", "Van Gogh style", etc.
        strength: Degree of change (higher → more change). Typical: 0.2–0.8.

    Returns:
        PIL.Image on success, or None on failure.
    """
    try:
        client = _get_hf_client()
        edited = client.image_to_image(
            model=HF_IMG_EDIT,        # instruct-pix2pix
            image=source_image,
            prompt=style_prompt,
            strength=strength,
        )
        return edited
    except Exception as e:
        print(f"image_generation: style transfer failed: {e}")
        return None


def beautify_sketch(
    sketch_image: Image.Image,
    level: str = "medium",
    refine_with_model: bool = True,
    prompt_hint: str = "clean line art, smooth curves, vector-like, high contrast",
) -> Optional[Image.Image]:
    """
    Clean and beautify a rough sketch. Performs local denoise/sharpen first,
    then optionally refines with an image-to-image edit model.

    Args:
        sketch_image: PIL image of a line drawing or rough sketch.
        level: 'light' | 'medium' | 'strong' — controls denoise strength.
        refine_with_model: If True, run an img2img refinement step.
        prompt_hint: Guidance text for the refinement model.

    Returns:
        PIL.Image on success, or None on failure.
    """
    try:
        img = sketch_image.convert("L")               # grayscale
        img = ImageOps.autocontrast(img)              # normalize contrast

        if level == "light":
            img = img.filter(ImageFilter.MedianFilter(size=3))
        elif level == "medium":
            img = img.filter(ImageFilter.MedianFilter(size=3)).filter(
                ImageFilter.GaussianBlur(radius=0.6)
            )
        else:  # strong
            img = img.filter(ImageFilter.MedianFilter(size=5)).filter(
                ImageFilter.GaussianBlur(radius=1.0)
            )

        # Re-invert trick to emphasize edges after smoothing
        img = ImageOps.invert(ImageOps.autocontrast(ImageOps.invert(img)))

        cleaned_rgb = img.convert("RGB")

        # Optional refinement via HF model
        if not refine_with_model:
            return cleaned_rgb

        try:
            client = _get_hf_client()
            refined = client.image_to_image(
                model=HF_IMG_EDIT,
                image=cleaned_rgb,
                prompt=prompt_hint,
                strength=0.35 if level == "light" else 0.5 if level == "medium" else 0.65,
            )
            return refined
        except Exception as e:
            print(f"image_generation: beautify refine skipped: {e}")
            return cleaned_rgb

    except Exception as e:
        print(f"image_generation: beautify failed: {e}")
        return None

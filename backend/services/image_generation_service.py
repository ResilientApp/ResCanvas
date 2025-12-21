
from config import OPENAI_API_KEY


def text_to_image(prompt: str, width: int = 512, height: int = 512, style: str = "default"):
	"""
	Generate an image for the given prompt. Returns a PIL.Image object on success.
	This function attempts to use the OpenAI Images API if available; otherwise,
	it falls back to generating a very small placeholder image so the endpoint
	returns something useful for UI development.
	"""
	# Try OpenAI Images (if package available)
	try:
		from openai import OpenAI
		from PIL import Image
		import base64
		import io

		client = OpenAI(api_key=OPENAI_API_KEY)

		# Attempt to use images.generate if available on the client
		try:
			resp = client.images.generate(
				model="gpt-image-1",
				prompt=prompt,
				size=f"{width}x{height}"
			)
			# The response may contain base64 data depending on the SDK version
			b64 = None
			if isinstance(resp, dict) and resp.get("data") and isinstance(resp["data"], list):
				item = resp["data"][0]
				if isinstance(item, dict) and item.get("b64_json"):
					b64 = item.get("b64_json")
			if b64:
				img_bytes = base64.b64decode(b64)
				return Image.open(io.BytesIO(img_bytes))
		except Exception:
			# Fall back to other approaches below
			pass

	except Exception:
		# openai or PIL not available - fall through to placeholder
		pass

	# Placeholder fallback: create a simple blank image (Pillow may be missing)
	try:
		from PIL import Image, ImageDraw, ImageFont
		img = Image.new("RGBA", (width, height), (255, 255, 255, 255))
		draw = ImageDraw.Draw(img)
		# Draw a small placeholder label in the center if fonts available
		try:
			f = ImageFont.load_default()
			text = "AI\nImage"
			w, h = draw.multiline_textsize(text, font=f)
			draw.multiline_text(((width - w) / 2, (height - h) / 2), text, fill=(120, 120, 120), font=f, align="center")
		except Exception:
			pass
		return img
	except Exception as e:
		raise RuntimeError("No image generation backend available: " + str(e))


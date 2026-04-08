import os
import json
import re
from openai import OpenAI
from prisma import Prisma

async def repair_titles():
    client = OpenAI()
    db = Prisma()
    await db.connect()
    
    # 1. Find all sources with generic titles
    GENERIC_TITLES_DENYLIST = ["Podcast Episode", "episode", "unknown", "untitled", "Episode"]
    
    sources = await db.source.find_many(
        where={
            "title": {
                "in": GENERIC_TITLES_DENYLIST
            }
        }
    )
    
    print(f"Found {len(sources)} sources with generic titles.")
    
    for source in sources:
        source_id = source.id
        content = source.content
        
        if not content or len(content) < 100:
            print(f"[{source_id}] No content available for title recovery.")
            continue
            
        print(f"[{source_id}] Attempting title recovery from transcript...")
        
        prefix = content[:3000]
        prompt = f"""
        Below is the start of a transcript from a podcast episode.
        The current metadata is missing the correct episode title and show name.
        Please identify the episode title and the name of the podcast/show from the text.
        
        Transcript Snippet:
        {prefix}
        
        Return ONLY a JSON object with "title" and "show_name". If you can't be sure, return null for the fields.
        """
        
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            title = result.get("title")
            show = result.get("show_name")
            
            if title and len(title) > 3:
                print(f"[{source_id}] Recovered: {title} | {show}")
                await db.source.update(
                    where={"id": source_id},
                    data={
                        "title": title,
                        "creator": show or source.creator
                    }
                )
            else:
                print(f"[{source_id}] No title recovered.")
                
        except Exception as e:
            print(f"[{source_id}] Error: {e}")
            
    await db.disconnect()

if __name__ == "__main__":
    import asyncio
    asyncio.run(repair_titles())

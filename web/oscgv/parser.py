import numpy as np
from svgpathtools import svg2paths
import warnings

def parse_svg(file_path, points_per_unit=100):
    """
    Parses an SVG file and converts it into a list of normalized point arrays.
    
    Args:
        file_path (str): Path to the SVG file.
        points_per_unit (int): Density of points per unit length.
        
    Returns:
        list of np.ndarray: A list where each element is a (N, 2) numpy array of (x, y) coordinates.
                           Coordinates are normalized to [-1, 1].
    """
    paths, attributes = svg2paths(file_path)
    
    if not paths:
        raise ValueError("No paths found in SVG file.")
    
    # Calculate bounding box of all paths
    min_x, max_x, min_y, max_y = float('inf'), float('-inf'), float('inf'), float('-inf')
    
    # First pass: compute bounding box and total length
    for path in paths:
        try:
            xmin, xmax, ymin, ymax = path.bbox()
            min_x = min(min_x, xmin)
            max_x = max(max_x, xmax)
            min_y = min(min_y, ymin)
            max_y = max(max_y, ymax)
        except Exception as e:
            warnings.warn(f"Could not compute bbox for path: {e}")
            continue

    if min_x == float('inf'):
         raise ValueError("Could not determine bounding box of SVG.")

    # Calculate center and scale
    center_x = (max_x + min_x) / 2
    center_y = (max_y + min_y) / 2
    
    width = max_x - min_x
    height = max_y - min_y
    scale = max(width, height) / 2  # Scale to fit in [-1, 1]
    
    if scale == 0:
        scale = 1 # Avoid division by zero for single point
    
    extracted_paths = []
    
    for path in paths:
        length = path.length()
        if length == 0:
            continue
            
        # Determine number of points based on length
        num_points = max(2, int(length * points_per_unit))
        
        # Sample points
        path_points = []
        for i in range(num_points):
            t = i / (num_points - 1)
            point = path.point(t)
            
            # Normalize and flip Y (SVG y-axis is down, oscilloscope is usually up, 
            # but usually we want to preserve visual orientation, so we flip Y relative to center)
            # Actually, standard math plot is Y up. SVG is Y down.
            # To look "correct" on a scope (y-up), we should invert the SVG Y coordinate.
            
            x = (point.real - center_x) / scale
            y = -(point.imag - center_y) / scale # Invert Y for oscilloscope display
            
            path_points.append([x, y])
            
        extracted_paths.append(np.array(path_points))
        
    return extracted_paths

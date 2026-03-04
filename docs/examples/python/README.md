# Python scripts

1. Load an XML model.
2. Export as Python, which creates, say model.py in your Downloads folder. From the command line in your Downloads folder see what command line arguments are available in the Python script 
```bash
python3 model.py --help
```
## Example Python command lines and output
### Hard-coded results (annuity)

`python3 annuity-model.py`

### Static chart (Lorenz)

`python3 lorenz.py --steps 60000 --plot-static --plot-vars "lorenz:x,y,z" --gif lorenz60000_static.gif`

### Static chart and hard-coded results (annuity)

### Animated chart (spacecraft)





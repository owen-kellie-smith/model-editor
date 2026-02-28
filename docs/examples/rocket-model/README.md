# Examples -- Non-linear dynamics

This folder contains non-financial example models demonstrating how the
declarative system can represent time-stepped dynamical systems.

The first example models a spacecraft orbiting Earth, perturbed by
the Moon. Thrust controls represent an optional TLI in order to attempt to achieve low lunar orbit.

The second example is a numerical integration of the [Lorenz Equations (1963)](https://en.wikipedia.org/wiki/Lorenz_system).

These examples demonstrate that the declarative modelling system can
express nonlinear dynamics, indexed recursion, and adaptive stepping.

------------------------------------------------------------------------

# 1. Spacecraft orbiting Earth

Using [rocket_with_thrust.xml](rocket_with_thrust.xml) 

------------------------------------------------------------------------

# 2. [Lorenz Equations (1963)](https://en.wikipedia.org/wiki/Lorenz_system)

Load [lorenz-difference.xml](lorenz-difference.xml) into the model-editor to integrate

## Equations

$$
\frac{dx}{dt} = \sigma (y - x)
$$

$$
\frac{dy}{dt} = x(\rho - z) - y
$$

$$
\frac{dz}{dt} = xy - \beta z
$$

with classic chaotic parameters

$$
\sigma = 10
$$

$$
\rho = 28
$$

$$
\beta = \frac{8}{3}
$$

Export to Python, add [plotting](#3-plotting-numerical-output) and run for 50000 steps i.e. in this case
`python3 lorenz_with_3d_plot.py --steps 50000`
 
![Screenshot of a numerical integration of Lorenz equations output by Python rendering.](lorenzXYZ_50000steps.png)
------------------------------------------------------------------------

# 3. Plotting numerical output

I found it much quicker to generate the numerical results via the exported Python script than via the exported spreadsheet.
The exported Python script does not contain any plot command but you can manually add it.
For example, by loading [lorenz-difference.xml](lorenz-difference.xml), exporting its model.py Python script, and comparing that with [lorenz_with_3d_plot.py](lorenz_with_3d_plot.py) (which produced the graphic below) you can see that all that was added was
```
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D  
```
(near the top of model.py) and
```
        # ---- 3D Plot of x,y,z ----
        ts = list(range(0, TEMP_MAX + 1))

        xs, ys, zs = [], [], []
        for tval in ts:
            xs.append(CACHE.get(("x", (tval,)), float("nan")))
            ys.append(CACHE.get(("y", (tval,)), float("nan")))
            zs.append(CACHE.get(("z", (tval,)), float("nan")))

        # Filter out NaNs so matplotlib doesn't silently plot nothing
        pts = [(x, y, z) for x, y, z in zip(xs, ys, zs)
               if not (math.isnan(x) or math.isnan(y) or math.isnan(z))]

        if not pts:
            print("No finite (x,y,z) points found to plot. "
                  "Try running with --strict to see why values are NaN.")
        else:
            xs, ys, zs = zip(*pts)

            fig = plt.figure()
            ax = fig.add_subplot(111, projection="3d")
            ax.plot(xs, ys, zs)

            ax.set_xlabel("x")
            ax.set_ylabel("y")
            ax.set_zlabel("z")
            ax.set_title("Lorenz Attractor")
            plt.show()
```
(near the bottom)

------------------------------------------------------------------------



#include <stdio.h>
int main()
{
//i need to store the number of units entered by user
	int units;
// need to store final bill amount too
	float bill;
//ask the user to enter units consumed
	printf("Enter units consumed: ");
//ensuring the message is displayed before taking input
	fflush(stdout);
//accepting the number of units from the user
	scanf("%d", &units);
// if user has consumed 100 units or less
// all units will be charged at 5rs per unit
	if (units<=100)
	{
		bill = units*5;
	}
//otherwise if user consumes 101 to 200 units
//first 100 units are are charged at 5rs per unit
//remaining units are charged at 7rs per unit
	else if(units<=200)
	{
		bill = (100*5) +((units-100)*7);
	}
//if units consumed are more than 200
//first 100 units are are charged at 5rs per unit
//next 100 units are charged at 7rs per unit
//remaining units are charged at 10rs per unit
	else
	{
		bill = (100*5) + (100*7)+((units-200)*10);
	}
//display the electricity bill heading
	printf("\nelectricity bill\n");
 //display number of units entered by user
	printf("units consumed:%d\n", units);
//display final bill with two decimal places
	printf("total bill   :Rs.%.2f\n",bill);

	return 0;
}